// wash-day-tip — generates a personalised wash-day tip for the user based on
// their hair profile, health/blood signals, goals and current style.
//
// Cached per user in ai_summaries with a stable fingerprint so the tip stays
// the same until the underlying data actually changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";
import {
  buildGroundingBlock,
  flaggedMarkerPhrase,
} from "../_shared/grounding.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
  userIdFromRequest,
} from "../_shared/advice-ledger.ts";

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

const MODEL_VERSION = "wash-tip@v6-full-history";

interface TipPayload {
  headline: string;
  why: string;
  technique: string;
  /** Optional "try this next wash day" section. Empty string = omitted. */
  next_time?: string;
  fingerprint: string;
  _model_version: string;
  /** Support level the tip was written for — a mismatch is a cache miss. */
  tipsLevel?: number | null;
  _manuscript_grounded?: boolean;
  _rag_passages?: number;
}

interface Body {
  fingerprint: string;
  hairProfile?: Record<string, unknown> | null;
  healthProfile?: Record<string, unknown> | null;
  goals?: Array<{ title?: string; category?: string }>;
  currentStyle?: Record<string, unknown> | null;
  bloodFlags?: Array<{ marker: string; status?: string; value?: number | null }>;
  hasWashHistory?: boolean;
  challenges?: string[];
  areasOfConcern?: string[];
  recentWashDay?: { id?: string; date?: string } | null;
  recentAppointment?: { id?: string; date?: string } | null;
  /**
   * Aggregate of EVERY logged wash day (cadence, heat frequency, breakage
   * pattern, product rotation, step mix) — computed client-side in
   * src/lib/washHistoryAggregate.ts.
   */
  washHistory?: Record<string, unknown> | null;
  /** How her hair has felt, newest first (voice notes are transcribed into these). */
  hairFeelNotes?: Array<{ date?: string; note?: string }>;
  /** Products on her shelf — suggestions must come from these. */
  shelfProducts?: Array<{ name?: string; brand?: string | null; category?: string | null }>;
  tipsLevel?: number | null;
  /**
   * Which surface the tip is for. "style" powers the Current Hairstyle screen —
   * same grounded pipeline, style/tension/extension framing instead of wash
   * sequencing, so no educational copy is hardcoded in the client.
   */
  surface?: "wash_day" | "style";

}

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Produce ONE personalised wash-day tip for this specific user, grounded in the STRAND manuscript teachings and the user's live data. Read the WHOLE picture, not a snapshot: the aggregate of every wash day they have logged (cadence, heat frequency, breakage pattern, product rotation, step mix), their hair profile, how their hair has felt in their own words, their current style (tension, extensions), their planned next style, their goals and their challenges. This is the tip that will show on their Wash Day screen until their data changes.

OUTPUT — JSON object only, no prose outside it:
{
  "headline": string,   // 3-7 words, Title Case, no trailing punctuation. Names the WHOLE tip.
  "why": string,        // 2-3 sentences. Ties the tip to THIS user's data (name a specific trait, pattern across their logs, marker, or goal). No filler.
  "technique": string,  // 1-2 sentences. The concrete "how" — sequence, product type, tool, timing.
  "next_time": string   // OPTIONAL. 1-2 sentences framed as ONE option to try on their NEXT wash day, given where their hair is now and the style they are moving into. Return "" when there is nothing genuinely worth suggesting — never pad it.
}

RULES:
- Do NOT invent user data. If a slice is missing, ground the tip in what IS present.
- Reason from PATTERNS across all their logs (recurring breakage, how often heat appears, how their cadence is drifting, which products they rotate) rather than from the most recent wash alone.
- Where their own words about how their hair feels are present, reflect them back accurately. Never overwrite what they said with an assumption.
- PRODUCTS: only ever name a product that appears in shelfProducts. Prefer what they already own. If nothing on the shelf fits, describe the product TYPE (e.g. "a creamy leave-in") and name no brand at all. Never invent a product, never name a product they do not own.
- If bloodFlags include ferritin/iron/vitD-low, connect wash-day scalp care to the regrowth environment.
- If hair porosity is high, lead with sealing/moisture-lock; if low, lead with clarifying/heat-assisted penetration.
- Never prescribe pre-poo as a scheduled ritual. Never say "use protein weekly". Never recommend shower caps, plastic caps, warm towels, or steamers — the only heat tool referenced is the TT Heat Hat (teamtexture.co.uk).
- Never contradict the Chapter 13 wash-day protocol (cleanse scalp → cleanse hair → condition).
- No book/chapter citations. No emojis. No pleasantries.
`;

const STYLE_SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Produce ONE personalised styling tip for this specific user, grounded in the STRAND manuscript teachings and their live data (hair profile, health signals, blood flags, goals, current and planned style, style tension, whether extensions are in). This is the tip shown on their Current Hairstyle screen until their data changes.

OUTPUT — JSON object only, no prose outside it:
{
  "headline": string,   // 3-7 words, Title Case, no trailing punctuation.
  "why": string,        // 2-3 sentences. Ties the tip to THIS user's style, tension, extensions or a goal they set.
  "technique": string   // 1-2 sentences. The concrete "how" for wearing, maintaining or taking down this style.
}

RULES:
- Do NOT invent user data. Ground the tip in what IS present.
- If style tension is high, reason about hairline and edge load and what to change.
- If extensions are in, reason about added weight, scalp access and take-down.
- If a length-retention goal is present, be accurate that trims preserve length rather than speeding growth.
- Never recommend shower caps, plastic caps, warm towels, or steamers — the only heat tool referenced is the TT Heat Hat (teamtexture.co.uk).
- No book/chapter citations. No emojis. No pleasantries.
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

  const isStyle = body.surface === "style";
  const kind = isStyle ? "style_tip" : "wash_day_tip";

  // Cache check — same fingerprint = same tip.
  const { data: cached } = await admin
    .from("ai_summaries")
    .select("payload")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  const cachedPayload = cached?.payload as TipPayload | null;
  const requestedLevel =
    typeof body.tipsLevel === "number" ? body.tipsLevel : null;
  if (
    cachedPayload &&
    cachedPayload.fingerprint === body.fingerprint &&
    cachedPayload._model_version === MODEL_VERSION &&
    (cachedPayload.tipsLevel ?? null) === requestedLevel
  ) {
    return json(200, { tip: await sanitiseAndLog(cachedPayload, "wash-day-tip", { context: body }), cached: true });
  }

  // Build a compact context blob for the model. Style first — the tip must
  // speak to what she is wearing NOW and what she is moving to next.
  const contextBlock = {
    currentStyle: body.currentStyle ?? null,
    challenges: (body.challenges ?? []).slice(0, 6),
    areasOfConcern: (body.areasOfConcern ?? []).slice(0, 8),
    mostRecentWashDay: body.recentWashDay ?? null,
    mostRecentAppointment: body.recentAppointment ?? null,
    hairProfile: body.hairProfile ?? null,
    healthProfile: body.healthProfile ?? null,
    goals: (body.goals ?? []).slice(0, 5),
    bloodFlags: (body.bloodFlags ?? []).slice(0, 8),
    hasWashHistory: body.hasWashHistory ?? false,
    // Aggregate across ALL logged wash days, not just the latest one.
    washHistoryAcrossAllLogs: body.washHistory ?? null,
    hairFeelInHerWords: (body.hairFeelNotes ?? []).slice(0, 6),
    shelfProducts: (body.shelfProducts ?? []).slice(0, 40),
  };

  // ── Manuscript grounding: knowledge topics + retrieved passages ────
  const hp = (body.hairProfile ?? {}) as Record<string, unknown>;
  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  const selectorCtx: SelectorContext = {
    hair: {
      porosity: asArray(hp.porosity),
      density: asArray(hp.density),
      scalp: asArray(hp.scalp ?? hp.scalp_condition),
      diagnosed: asArray(hp.diagnosed ?? hp.diagnosed_conditions),
    },
    health: (body.healthProfile ?? null) as unknown as SelectorContext["health"],
    bloodResults: (body.bloodFlags ?? []) as Array<{ marker?: string; status?: string | null }>,
  };
  const style = (body.currentStyle ?? {}) as Record<string, unknown>;
  const ragQuery = [
    isStyle
      ? "protective styling tension edges hairline extensions take-down scalp care"
      : "wash day routine cleanse condition moisture retention scalp",
    asArray(hp.porosity).join(" ") && `${asArray(hp.porosity).join(" ")} porosity`,
    asArray(hp.density).join(" ") && `${asArray(hp.density).join(" ")} density`,
    asArray(hp.scalp ?? hp.scalp_condition).join(" "),
    style.current_hairstyle ? `currently wearing ${style.current_hairstyle}` : "",
    style.current_style_tension ? `${style.current_style_tension} tension` : "",
    style.current_style_extensions === true
      ? "with extensions"
      : style.current_style_extensions === false
        ? "without extensions"
        : "",
    (body.goals ?? []).map((g) => g.title ?? "").join(" "),
    flaggedMarkerPhrase(body.bloodFlags),
  ].filter(Boolean).join(" — ");

  const styleHeader = [
    `CURRENT STYLE: ${style.current_hairstyle ?? "not recorded"}`,
    style.current_style_tension ? `tension ${style.current_style_tension}` : "",
    style.current_style_extensions === true
      ? "with extensions"
      : style.current_style_extensions === false
        ? "without extensions"
        : "",
    `PLANNED NEXT STYLE: ${style.planned_next_style ?? "not recorded"}`,
    style.planned_style_tension ? `planned tension ${style.planned_style_tension}` : "",
    style.planned_style_extensions === true
      ? "planned with extensions"
      : style.planned_style_extensions === false
        ? "planned without extensions"
        : "",
  ].filter(Boolean).join(" — ");

  const ledger = await fetchAdviceLedger(user.id);
  const ledgerBlock = buildAdviceLedgerBlock(ledger);

  const grounding = await buildGroundingBlock({
    fn: isStyle ? "style-tip" : "wash-day-tip",
    functionKind: "wash-day-observation",
    selectorContext: selectorCtx,
    forceTopics: isStyle
      ? ["protective-styling", "hair-architecture"]
      : ["wash-day-mechanics", "porosity"],
    ragQuery,
    ragK: 5,
  });

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
          { role: "system", content: `${isStyle ? STYLE_SYSTEM : SYSTEM}${grounding.block}\n\n${buildTipsLevelBlock((body as unknown as Record<string, unknown>).tipsLevel)}${ledgerBlock ? `\n\n${ledgerBlock}` : ""}` },
          {
            role: "user",
            content: `${styleHeader}\n\nUser data (JSON):\n${JSON.stringify(contextBlock)}\n\nReturn the tip JSON now.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    console.error("[wash-day-tip] gateway fetch failed:", err);
    return json(502, { error: "ai gateway unreachable" });
  }
  if (!aiResp.ok) {
    const text = await aiResp.text().catch(() => "");
    console.error("[wash-day-tip] gateway error:", aiResp.status, text);
    if (aiResp.status === 429) return json(429, { error: "rate_limited" });
    if (aiResp.status === 402) return json(402, { error: "credits_exhausted" });
    return json(502, { error: "ai gateway error" });
  }

  const j = await aiResp.json();
  const raw = j?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { headline?: string; why?: string; technique?: string; next_time?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(502, { error: "invalid model output" });
  }
  if (!parsed?.headline || !parsed?.why) {
    return json(502, { error: "invalid model output" });
  }

  // The next-wash suggestion is optional by design — an empty/absent value
  // means the section is omitted from the card rather than padded.
  const nextTime = isStyle ? "" : String(parsed.next_time ?? "").trim();

  const payload: TipPayload = {
    headline: String(parsed.headline).trim(),
    why: String(parsed.why).trim(),
    technique: String(parsed.technique ?? "").trim(),
    next_time: nextTime,
    fingerprint: body.fingerprint,
    _model_version: MODEL_VERSION,
    tipsLevel: requestedLevel,
    _manuscript_grounded: grounding.grounded,
    _rag_passages: grounding.passages,
  };

  await admin
    .from("ai_summaries")
    .upsert(
      { user_id: user.id, kind, payload },
      { onConflict: "user_id,kind" },
    );

  await recordAdvice(user.id, isStyle ? "style-tip" : "wash-day-tip", [payload.headline, payload.technique, payload.next_time ?? ""]);

  return json(200, {
    tip: await sanitiseAndLog(payload, "wash-day-tip", { context: body, grounding: grounding.block }),
    cached: false,
  });
});
