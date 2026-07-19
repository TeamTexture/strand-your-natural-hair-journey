// hair-strand-summary — generates a professional, post-onboarding AI summary
// of the user's hair: overview + action plan bullets + routine tips.
//
// Saves the result to public.hair_strand_summaries and returns it to the
// client. Uses the Lovable AI Gateway (Gemini) — no Claude dual-path yet.
//
// Includes a TT Heat Hat / www.teamtexture.co.uk mention ONLY when the user's
// data signals it's scientifically relevant (low porosity, dry/coarse strands,
// moisture-retention goals, heat-friendly protective styling, etc.).
//
// Auth: requires a valid Supabase user JWT; persists rows server-side with
// service role so RLS-protected inserts still flow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  selectTopicsForContext,
  renderTopicBlock,
  type SelectorContext,
} from "../_shared/knowledge/index.ts";
import { retrievePassages, renderPassageBlock } from "../_shared/rag.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  context?: Record<string, unknown> | null;
  beforePhotoCount?: number;
  inputHash?: string | null;
}

interface SummaryPayload {
  overview: string;
  action_plan: string[];
  routine_tips: string[];
}

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Produce a personalised hair profile written directly to the user, grounded in the STRAND manuscript teachings supplied below and the user's data. This is a factual advisory record from a knowledgeable professional who knows the user's file — clear, useful, and warm in the way a good clinician is warm: respectful, plain, human. Not cold, not corporate, not chirpy.

OUTPUT — JSON object only, no prose outside it:
{
  "overview": string,            // 3-5 sentences. Second-person description of the user's hair, current style, and any relevant clinical/blood signals. Plain, factual, human. No pleasantries, no flattery, no filler.
  "action_plan": [],             // DEPRECATED. Always return an empty array. Fold every concrete action into routine_tips instead.
  "routine_tips": string[]       // 4-6 items. See ROUTINE TIP RULES below. This is now the ONLY list of recommendations shown to the user, so it must carry the concrete actions AND their reasoning.
}

ROUTINE TIP RULES — CRITICAL:
Each item MUST be a single sentence that follows this shape:
  "[Concrete action with frequency + product/technique] — [short reason tied to THIS user's data, grounded in the manuscript]."
- Start with an imperative verb ("Pre-poo", "Deep condition", "Detangle", "Refresh", "Clarify"...).
- Include a frequency or trigger ("every wash", "weekly", "before every install", "when strands feel straw-like").
- Include the technique or product type ("with a slip-heavy conditioner", "using the TT Heat Hat for 20-30 min", "sectioned in 4, fingers first then wide-tooth comb").
- End with a short "because ..." / "— your ..." clause that names the specific trait/goal/marker driving the advice (e.g. "— your high porosity loses water fast", "— low ferritin is slowing regrowth").
- Do NOT repeat the same action twice in different words. Each tip must be a distinct instruction.
- BANNED phrases (too vague): "manage", "maintain", "look after", "take care of", "keep an eye on", "be mindful of", "focus on moisture", "prioritise hydration", "monitor", "consider", "try to". Rewrite any item that drifts this way.
- Every tip MUST be grounded in the manuscript teachings provided below. Do not invent guidance outside them. If porosity, scalp condition, protective style, heat use, or a flagged blood marker is present in the data, at least one tip must reference it directly.

TONE:
- Speak TO the user as "you" / "your". Never "the client", "the user", "the patient".
- Warm-professional: like a senior trichologist who has read your file, not a chatbot and not a friend. No pleasantries, no compliments, no exclamation marks, no emojis, no questions.
- Never use the banned flattery words ("gorgeous", "beautiful", "amazing", "queen", "journey", etc.).
- Every recommendation must be justified by the data + manuscript teachings. If data is missing for a claim, omit the claim.

HEAT MENTIONS: Include a TT Heat Hat (www.teamtexture.co.uk) instruction only where the data warrants it (low porosity, dryness, moisture-retention goal, deep-condition routine). If included, write it as a concrete routine step with duration.


Below are the manuscript teachings most relevant to THIS user. Base every action item and routine tip on this material:
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "Missing auth" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
      return json(500, { error: "Server misconfigured" });
    }

    // Authenticated client to identify the caller
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json(401, { error: "Invalid token" });

    const body = (await req.json().catch(() => ({}))) as Body;
    const context = (body.context ?? {}) as Record<string, unknown>;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "LOVABLE_API_KEY not configured" });

    // Select relevant manuscript topics for this user so action_plan / tips
    // are rooted in the book's teachings, not generic AI advice.
    const selectorCtx: SelectorContext = {
      hair: (context.hairProfile ?? context.hair) as SelectorContext["hair"],
      health: (context.healthProfile ?? context.health) as SelectorContext["health"],
      bloodResults: Array.isArray(context.bloodResults)
        ? (context.bloodResults as Array<{ marker?: string; status?: string | null }>)
        : [],
    };
    // No dedicated function_kind for the strand summary — reuse
    // wash-day-observation so wash-day-mechanics (moisture-first) is always
    // pulled in, then let the selector add whatever the user's signals match.
    const topics = selectTopicsForContext(selectorCtx, {
      function_kind: "wash-day-observation",
      force: ["wash-day-mechanics", "protein-and-strengthening"],
    });
    const knowledgeBlock = topics.map(renderTopicBlock).join("\n\n---\n\n");

    // Retrieve manuscript passages tailored to this user's key signals so
    // the summary is grounded in the actual book text, not just KB summaries.
    const hair = (context.hairProfile ?? {}) as Record<string, unknown>;
    const ragQuery = `Afro hair porosity ${hair.porosity ?? ""} density ${hair.density ?? ""} ${
      hair.hair_type ?? ""
    } routine wash day moisture retention scalp ${
      Array.isArray(context.bloodResults)
        ? (context.bloodResults as Array<Record<string, unknown>>)
            .filter((b) => b.status && b.status !== "normal")
            .map((b) => b.marker ?? "")
            .join(" ")
        : ""
    }`.trim();
    let ragBlock = "";
    try {
      const passages = await retrievePassages(ragQuery, 5);
      if (passages.length > 0) {
        ragBlock = `\n\nRETRIEVED MANUSCRIPT PASSAGES\n\n${passages.map(renderPassageBlock).join("\n\n---\n\n")}`;
      }
    } catch (e) {
      console.warn("hair-strand-summary RAG retrieval failed (continuing without):", e);
    }
    const systemWithKnowledge = `${SYSTEM}\n\n${knowledgeBlock}${ragBlock}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemWithKnowledge },
          {
            role: "user",
            content: `User onboarding context (currentStyle, goals, hairProfile, healthProfile, bloodResults, location, history):\n\n${JSON.stringify(context)}\n\nBefore-photo count: ${body.beforePhotoCount ?? 0}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) return json(429, { error: "Rate limited, please retry" });
    if (aiRes.status === 402) return json(402, { error: "AI credits exhausted" });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("ai gateway failed", aiRes.status, t.slice(0, 200));
      return json(502, { error: "AI request failed" });
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<SummaryPayload> = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const rawAction = Array.isArray(parsed.action_plan) ? parsed.action_plan.map(String) : [];
    const rawTips = Array.isArray(parsed.routine_tips) ? parsed.routine_tips.map(String) : [];
    // Merge any lingering action_plan items into routine_tips (deduped by first 40 chars)
    const seen = new Set<string>();
    const mergedTips: string[] = [];
    for (const t of [...rawTips, ...rawAction]) {
      const key = t.trim().toLowerCase().slice(0, 40);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      mergedTips.push(t.trim());
    }
    const payload: SummaryPayload = {
      overview: (parsed.overview ?? "").toString().trim(),
      action_plan: [], // deprecated — always empty going forward
      routine_tips: mergedTips.slice(0, 6),
    };


    if (!payload.overview) {
      return json(502, { error: "AI returned empty summary" });
    }

    // Persist with service role (RLS-safe — we stamp user_id explicitly)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: saved, error: insErr } = await admin
      .from("hair_strand_summaries")
      .insert({
        user_id: user.id,
        overview: payload.overview,
        action_plan: payload.action_plan,
        routine_tips: payload.routine_tips,
        context_snapshot: context,
        input_hash: body.inputHash ?? null,
      })
      .select()
      .single();

    if (insErr) {
      console.error("strand summary insert failed", insErr);
      // Still return the payload so the UI can render it even if persist failed.
      return json(200, { ...payload, _persisted: false });
    }

    return json(200, { ...payload, id: saved.id, _persisted: true });
  } catch (e) {
    console.error("hair-strand-summary error", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
