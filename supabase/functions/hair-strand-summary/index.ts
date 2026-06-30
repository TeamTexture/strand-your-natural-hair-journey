// hair-strand-summary — generates a personalised, post-onboarding AI summary
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
}

interface SummaryPayload {
  overview: string;
  action_plan: string[];
  routine_tips: string[];
}

const SYSTEM = `You are STRAND, a clinically-informed hair coach. Generate a warm, personalised post-onboarding summary for THIS specific user, grounded ONLY in the data provided.

OUTPUT — JSON object, no prose outside it:
{
  "overview": string,            // 3-5 sentences. Speak directly to the user ("you"). Reference their actual hair profile, goals, and any low blood markers. No medical diagnoses.
  "action_plan": string[],       // 3-5 short concrete bullets ("Add a clarifying shampoo every 2-3 weeks", etc.). Each grounded in user data.
  "routine_tips": string[]       // 3-5 day-to-day tips tailored to their texture/porosity/style.
}

RULES:
- Never invent data. If a field is missing, don't reference it.
- Plain English, no jargon. Translate technical terms the first time you use one.
- Hair-health guidance only. No medical advice.
- NO chapter/book citations.
- Mention a gentle weekly heat treatment with a TT Heat Hat (www.teamtexture.co.uk) ONLY when the user's data clearly supports it: low porosity, dry/coarse strands, moisture-retention goals, heat-friendly protective styling, or recent dryness/breakage notes. Otherwise OMIT it entirely. If you do mention it, do so once, in routine_tips, in a single natural sentence — never as a sales pitch.`;

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

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
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

    const payload: SummaryPayload = {
      overview: (parsed.overview ?? "").toString().trim(),
      action_plan: Array.isArray(parsed.action_plan)
        ? parsed.action_plan.map(String).slice(0, 6)
        : [],
      routine_tips: Array.isArray(parsed.routine_tips)
        ? parsed.routine_tips.map(String).slice(0, 6)
        : [],
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
