// wash-day-steps — generates THIS user's personalised wash day sequence.
//
// PIVOT (2026-08-02, Paige): there is no static wash day step copy anywhere in
// the app and no manual review/publish gate for user-facing education. Every
// step and every why-line is generated here at runtime, grounded in retrieved
// manuscript passages, personalised against the user's own hair profile,
// current style, shelf and goals, and capped by her support level.
//
// Cached per user in ai_summaries against a fingerprint of everything that
// should change the sequence, so it stays stable until her data moves.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { buildTipsLevelBlock, coerceTipsLevel } from "../_shared/tips-level.ts";
import { buildGroundingBlock, flaggedMarkerPhrase } from "../_shared/grounding.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
} from "../_shared/advice-ledger.ts";
import { STEP_BUDGET, normaliseSteps, type WashStep } from "./normalise.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const MODEL_VERSION = "wash-steps@v3-manuscript-2026-08-09";

interface StepsPayload {
  steps: WashStep[];
  fingerprint: string;
  _model_version: string;
  tipsLevel: number;
  _manuscript_grounded: boolean;
  _rag_passages: number;
}

interface ShelfItem {
  id?: string;
  name?: string;
  brand?: string;
  category?: string;
}

interface RecentEvent {
  id?: string;
  date?: string;
}

interface Body {
  fingerprint: string;
  hairProfile?: Record<string, unknown> | null;
  currentStyle?: Record<string, unknown> | null;
  goals?: Array<{ title?: string; category?: string }>;
  bloodFlags?: Array<{ marker: string; status?: string; value?: number | null }>;
  shelf?: ShelfItem[];
  tools?: ShelfItem[];
  challenges?: string[];
  areasOfConcern?: string[];
  recentWashDay?: RecentEvent | null;
  recentAppointment?: RecentEvent | null;
  tipsLevel?: number | null;
}


const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Produce THIS user's personalised wash day sequence: the ordered steps she should follow, from preparation through to styling. This is the only wash day guide she will see, so it must be complete for her support level and true to her own hair.

OUTPUT — JSON object only, no prose outside it:
{ "steps": [ { "n": number, "headline": string, "body": string, "why": string, "icon_hint": string, "product_ref": string } ] }

PER-STEP CAPS (hard):
- headline: <= 8 words, sentence case, names the step. No trailing punctuation.
- body: <= 30 words. Plain imperative sentences telling her exactly what to do.
- why: <= 15 words, optional. The reason this step matters. OMIT it entirely unless the passages state the reason.
- icon_hint: one or two words naming the action (e.g. "water", "section", "cleanse", "condition", "heat", "detangle", "rinse", "seal", "style").
- product_ref: the exact name of one of HER products when this step uses it. Omit when no product of hers fits.

GROUNDING — ABSOLUTE:
- Every step and every why-line must come from the retrieved passages below. If the passages do not support a step or a reason, OMIT it. Never invent hair-care instruction, timings, or claims.
- Do not name the book, chapters, pages, or quote verbatim. Teach in your own voice.

PERSONALISATION — REQUIRED, not decoration:
- Sectioning: the number of sections must reflect her density (thicker/denser hair needs more sections).
- Soaking and timing: reflect her porosity and hair length — low porosity needs more help getting water in, high porosity loses it faster.
- Products: name HER products from the shelf where they genuinely fit the step (her shampoo, her conditioner, her leave-in, her styler) and put the name in product_ref. If her shelf has nothing suitable for a step, describe the product type generically instead — never invent a product she does not own.
- Heat: reference the TT Heat Hat only, and only if she owns it (check her tools); otherwise give the step without a heat tool. Never mention plastic caps, shower caps, warm towels or steamers.
- Current style: adapt the sequence to what she is wearing. In braids, locs or another protective style, the cleanse is scalp-focused and detangling/styling steps change or drop away accordingly.
- Deep conditioning: its emphasis and placement should reflect her porosity and her stated goals.
- Flagged blood markers: mention one only where it genuinely changes a step (usually scalp care). Otherwise leave them out.
- Goals: where a goal (length retention, moisture, scalp comfort) changes how a step is done, say so inside that step.

STRUCTURE:
- Chronological, starting at preparation and ending at styling. Never reorder the cleanse: scalp is cleansed first, the hair second, then conditioner. Never replace shampoo cleansing with co-washing, and never skip conditioner.
- ONE IDEA, ONCE: no step may repeat another step's instruction in different words.
- Never prescribe pre-poo as a scheduled ritual. Never say to use protein weekly.
- No emojis, no pleasantries, no headings inside body text.
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY missing" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { error: "unauthenticated" });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  if (!body?.fingerprint) return json(400, { error: "fingerprint required" });

  const level = coerceTipsLevel(body.tipsLevel);
  const budget = STEP_BUDGET[level];
  const kind = "wash_day_steps";

  // ── Cache ─────────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("ai_summaries")
    .select("payload")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  const cachedPayload = cached?.payload as StepsPayload | null;
  if (
    cachedPayload &&
    cachedPayload.fingerprint === body.fingerprint &&
    cachedPayload._model_version === MODEL_VERSION &&
    cachedPayload.tipsLevel === level &&
    Array.isArray(cachedPayload.steps) &&
    cachedPayload.steps.length > 0
  ) {
    const safeCached = await sanitiseAndLog(cachedPayload, "wash-day-steps", { context: body });
    return json(200, { steps: safeCached.steps, payload: safeCached, cached: true });
  }

  const hp = (body.hairProfile ?? {}) as Record<string, unknown>;
  const style = (body.currentStyle ?? {}) as Record<string, unknown>;
  const shelf = (body.shelf ?? []).slice(0, 40);
  const tools = (body.tools ?? []).slice(0, 20);

  // ── Grounding: fixed wash-process retrieval ───────────────────────
  const selectorCtx: SelectorContext = {
    hair: {
      porosity: asArray(hp.porosity),
      density: asArray(hp.density),
      scalp: asArray(hp.scalp ?? hp.scalp_condition),
      diagnosed: asArray(hp.diagnosed ?? hp.diagnosed_conditions),
    },
    health: null as unknown as SelectorContext["health"],
    bloodResults: (body.bloodFlags ?? []) as Array<{ marker?: string; status?: string | null }>,
  };

  const ragQuery = [
    "the wash day process from start to finish: preparing and sectioning the hair, soaking and saturating with water, cleansing the scalp first, cleansing the hair second, conditioning and detangling, deep conditioning with gentle heat, rinsing, moisturising and sealing, then styling",
    asArray(hp.porosity).join(" ") && `${asArray(hp.porosity).join(" ")} porosity`,
    asArray(hp.density).join(" ") && `${asArray(hp.density).join(" ")} density`,
    asArray(hp.hair_type ?? hp.surface_texture).join(" "),
    asArray(hp.scalp ?? hp.scalp_condition).join(" "),
    style.current_hairstyle ? `currently wearing ${String(style.current_hairstyle)}` : "",
    (body.goals ?? []).map((g) => g.title ?? "").join(" "),
    flaggedMarkerPhrase(body.bloodFlags),
  ]
    .filter(Boolean)
    .join(" — ");

  const grounding = await buildGroundingBlock({
    surface: "wash-day-steps",
    proceduralBias: true,
    fn: "wash-day-steps",
    functionKind: "wash-day-observation",
    selectorContext: selectorCtx,
    forceTopics: ["wash-day-mechanics", "porosity"],
    ragQuery,
    ragK: 10,
  });

  const ledgerBlock = buildAdviceLedgerBlock(await fetchAdviceLedger(user.id));

  const styleNow = (body.currentStyle ?? {}) as Record<string, unknown>;
  const styleHeader = [
    `CURRENT STYLE: ${styleNow.current_hairstyle ?? "not recorded"}`,
    styleNow.current_style_tension ? `tension ${styleNow.current_style_tension}` : "",
    styleNow.current_style_extensions === true
      ? "with extensions"
      : styleNow.current_style_extensions === false
        ? "without extensions"
        : "",
    `PLANNED NEXT STYLE: ${styleNow.planned_next_style ?? "not recorded"}`,
    styleNow.planned_style_tension ? `planned tension ${styleNow.planned_style_tension}` : "",
    styleNow.planned_style_extensions === true
      ? "planned with extensions"
      : styleNow.planned_style_extensions === false
        ? "planned without extensions"
        : "",
  ].filter(Boolean).join(" — ");

  const contextBlock = {
    currentStyle: body.currentStyle ?? null,
    challenges: (body.challenges ?? []).slice(0, 6),
    areasOfConcern: (body.areasOfConcern ?? []).slice(0, 8),
    mostRecentWashDay: body.recentWashDay ?? null,
    mostRecentAppointment: body.recentAppointment ?? null,
    hairProfile: body.hairProfile ?? null,
    goals: (body.goals ?? []).slice(0, 5),
    bloodFlags: (body.bloodFlags ?? []).slice(0, 8),
    shelf: shelf.map((p) => ({ name: p.name, brand: p.brand, category: p.category })),
    tools: tools.map((t) => ({ name: t.name, brand: t.brand, category: t.category })),
  };


  const budgetBlock = `STEP COUNT — support level ${level}: return ${budget.min}-${budget.max} steps. ${budget.note} If the passages do not support enough material to reach ${budget.min} steps, return fewer rather than inventing any.`;

  let aiResp: Response;
  try {
    aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content: `${SYSTEM}${grounding.block}\n\n${buildTipsLevelBlock(level)}\n\n${budgetBlock}${ledgerBlock ? `\n\n${ledgerBlock}` : ""}`,
          },
          {
            role: "user",
            content: `${styleHeader}\n\nHer data (JSON):\n${JSON.stringify(contextBlock)}\n\nReturn her wash day steps JSON now.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    console.error("[wash-day-steps] gateway fetch failed:", err);
    return json(502, { error: "ai gateway unreachable" });
  }
  if (!aiResp.ok) {
    const text = await aiResp.text().catch(() => "");
    console.error("[wash-day-steps] gateway error:", aiResp.status, text);
    if (aiResp.status === 429) return json(429, { error: "rate_limited" });
    if (aiResp.status === 402) return json(402, { error: "credits_exhausted" });
    return json(502, { error: "ai gateway error" });
  }

  const j = await aiResp.json();
  const rawContent = j?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { steps?: unknown };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return json(502, { error: "invalid model output" });
  }

  const steps = normaliseSteps(parsed.steps, level);
  if (steps.length === 0) return json(502, { error: "invalid model output" });

  const payload: StepsPayload = {
    steps,
    fingerprint: body.fingerprint,
    _model_version: MODEL_VERSION,
    tipsLevel: level,
    _manuscript_grounded: grounding.grounded,
    _rag_passages: grounding.passages,
  };

  await admin
    .from("ai_summaries")
    .upsert({ user_id: user.id, kind, payload }, { onConflict: "user_id,kind" });

  await recordAdvice(
    user.id,
    "wash-day-steps",
    steps.map((s) => `${s.headline}. ${s.body}`),
  );

  const safePayload = await sanitiseAndLog(payload, "wash-day-steps", {
    context: body,
    grounding: grounding.block,
  });
  return json(200, { steps: safePayload.steps, payload: safePayload, cached: false });
});
