// wash-day-tip — generates a personalised wash-day tip for the user based on
// their hair profile, health/blood signals, goals and current style.
//
// Cached per user in ai_summaries with a stable fingerprint so the tip stays
// the same until the underlying data actually changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  buildGroundingBlock,
  flaggedMarkerPhrase,
} from "../_shared/grounding.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import {
  methodRetryDirective,
  validateTipSubstance,
} from "../_shared/tip-method.ts";
import {
  memberAttributeTokens,
  validateTipAction,
  validateTipReason,
  retryDirective,
  logTipRejection,
} from "../_shared/tip-action.ts";

import {
  buildProductNameWall,
  stripMarkdown,
  findProductNames,
  redactProductNames,
} from "../_shared/product-name-wall.ts";
import {
  applyLevelCaps,
  levelCapViolations,
  tipLevelPromptBlock,
} from "../_shared/tip-level-caps.ts";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
  userIdFromRequest,
} from "../_shared/advice-ledger.ts";
import { isEntitled, membershipRequired } from "../_shared/entitlement.ts";
import { gatewayFetch, recordAiOutcome } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "wash-day-tip", stage: 2 } as const;


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

const MODEL_VERSION = "wash-tip@v15-manuscript-2026-08-09";

interface TipPayload {
  headline: string;
  why: string;
  technique: string;
  /** REQUIRED at every support level — one concrete instruction for the next
   *  wash day. A headline alone is never a tip. */
  action: string;
  /** REQUIRED at every support level — WHY the action matters for this member.
   *  Never a restatement of the action. */
  reason: string;
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
  /** Products on her shelf. Used ONLY to reason about what TYPES she already
   *  has — their names never reach the model (see product-name-wall.ts). */
  shelfProducts?: Array<{ name?: string; brand?: string | null; category?: string | null }>;
  tipsLevel?: number | null;
  /** Diagnostic/test-harness run: generate and return, never read or write cache. */
  diagnostic?: boolean;

  /**
   * Which surface the tip is for. "style" powers the Current Hairstyle screen —
   * same grounded pipeline, style/tension/extension framing instead of wash
   * sequencing, so no educational copy is hardcoded in the client.
   */
  surface?: "wash_day" | "style";

}

// ─────────────────────────────────────────────────────────────────────────────
// THE TIP SPECIFICATION — ONE COHERENT WHOLE.
//
// This block is the single authority for Card 1 (the unsponsored STRAND tip) on
// both surfaces. It replaces the earlier stack of separate, partly contradictory
// blocks (SYSTEM + STYLE_SYSTEM + a generic verbosity block + a no-product-names
// block + a method rule), which between them told the model "name a real tool",
// "name nothing", "name the TT Heat Hat with a link", "write more", "write less".
// Nothing new is added here — the existing rules are reconciled and ordered.
//
// The rules are numbered in PRIORITY ORDER. When two rules pull in different
// directions, the lower number wins, and the model is told so explicitly.
// ─────────────────────────────────────────────────────────────────────────────
const buildTipSpec = (isStyle: boolean) => `${STRAND_PERSONA_WITH_RULES}

TASK — Produce ONE personalised ${isStyle ? "styling" : "wash-day"} tip for this specific member, grounded in the supplied manuscript passages and their live data. Read the WHOLE picture, not a snapshot: ${
  isStyle
    ? "their current style, its tension, whether extensions are in, the style they are moving into next, their hair profile, their goals and their challenges"
    : "the aggregate of every wash day they have logged (cadence, heat frequency, breakage pattern, product rotation, step mix), their hair profile, how their hair has felt in their own words, their current and planned style, their goals and their challenges"
}. This is the tip shown on their ${isStyle ? "Current Hairstyle" : "Wash Day"} screen until their data changes.

OUTPUT — a JSON object only, no prose outside it, PLAIN TEXT in every field:
{
  "headline": string,   // 3-7 words, Title Case, no trailing punctuation. Names the whole tip.
  "action": string,     // REQUIRED. What to DO. One instruction verb first. Shown at EVERY support level, so it must stand alone as usable guidance.
  "reason": string,     // REQUIRED. ONE sentence. WHY that action matters for THIS member — the mechanism or the consequence of skipping it. Explains; never restates the action.
  "why": string,        // Extended personalised context. HAND-HOLDING LEVEL ONLY — return "" otherwise.
  "next_time": string   // ONE option to try next time. HAND-HOLDING LEVEL ONLY${isStyle ? " and never on this surface — always return \"\"" : ""} — return "" otherwise.
}

THE RULES, IN PRIORITY ORDER. A lower number always beats a higher one.

1. GROUNDED. Every action, method, timing and mechanism must come from the RETRIEVED MANUSCRIPT PASSAGES or the STRAND KNOWLEDGE TOPICS supplied below — never from general hair-care lore. If the passages do not support a method for the obvious topic, choose a DIFFERENT tip they DO support. Never invent a method, a timing or a mechanism. Never invent member data: if a slice is missing, ground the tip in what IS present.

2. NO BRAND NAMES. This card is STRAND's own educational guidance, never an advert. You MAY name product TYPES, categories and tools generically — "a water-based scalp cleanser", "a leave-in conditioner", "a thick gel", "an emollient cream", "a wide-tooth comb", "a satin bonnet", "a spray bottle". You MUST NOT name a brand or a branded product anywhere in the output, including products this member owns, and must not describe a product so specifically that it identifies one. This overrides the persona's heat-tool rule ON THIS CARD ONLY: describe heat as a step ("leave the conditioner on under gentle heat for 15 minutes"), never as a named device, and never offer a plastic cap, shower cap, cling film, warm towel, steamer or hooded dryer as a substitute.

3. A REAL ACTION. "action" is never empty, never a topic statement, never a hedge — no "consider", "be mindful", "it's important to", "you may want to", "try to remember". It tells them what to physically do ${isStyle ? "next" : "on their next wash day"} and names at least one of their own recorded details (their style, porosity, density, a goal, a challenge, their last wash).

4. A REAL REASON. "reason" is never empty and never the action reworded. It states a mechanism or a consequence that the passages actually support. NO TAUTOLOGY: "protecting your hair prevents damage" and "keeping moisture in stops moisture loss" are circular and are rejected. If the why for one tip cannot be grounded, pick a tip whose why can be — never drop the why.

5. A NAMED METHOD AND ITS TIMING. Every tip names a specific intervention from the passages — a treatment, a technique, a step, a sequence, a product type, a tool, a frequency or a duration — and says WHEN where the passages support it: before installing, after take-down, the night before, on damp hair, immediately after rinsing, mid-week. An outcome is not a tip; a goal is not a tip; a principle is not a tip. Words like "maintain", "protect", "keep", "prioritise", "focus on", "stay on top of" may appear in the headline, but the body must convert them into something they physically do.

6. PERSONALISED, NOT DECORATIVE. Reason from PATTERNS across all their logs (recurring breakage, how often heat appears, how their cadence is drifting, which product types they rotate) rather than the latest entry alone. Where their own words about how their hair feels are present, reflect them back accurately and never overwrite them with an assumption. Only cite a data point when it changes the advice.${
  isStyle
    ? " If style tension is high, reason about hairline and edge load and what to change. If extensions are in, reason about added weight, scalp access and take-down."
    : " If porosity is high, lead with sealing and moisture-lock; if low, lead with clarifying and heat-assisted penetration. If bloodFlags show low ferritin, iron or vitamin D, connect scalp care to the regrowth environment without bridging the marker to a hair outcome."
} If a length-retention goal is present, be accurate that trims preserve length rather than speeding growth.

7. LEVEL-APPROPRIATE LENGTH. The support-level caps below are hard and are validated after generation. Write to the level you are given: brief does not mean thin, and full does not mean padded.


FORMAT — ONE CONVENTION: plain text. No markdown of any kind: no square-bracket links, no URLs, no asterisks, no bold, no headings, no bullet characters. No emojis. No pleasantries. No book, chapter or page citations.
${
  isStyle
    ? ""
    : "\nNever contradict the wash-day protocol: cleanse the scalp, then cleanse the hair, then condition."
}`;

const SYSTEM = buildTipSpec(false);
const STYLE_SYSTEM = buildTipSpec(true);


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
  // Paid feature: a lapsed membership loses AI guidance.
  if (!(await isEntitled(user.id))) return membershipRequired();
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

  // FAILURE IS NEVER SILENT. Every path that returns without serving a tip
  // flushes the buffered meter row with the reason, so a member-facing
  // "we couldn't finish your tip" is diagnosable from `ai_call_log` instead of
  // leaving an `unflushed` row with no rule.
  const failOutcome = (rule: string) => {
    try {
      recordAiOutcome({
        function_name: "wash-day-tip",
        surface: isStyle ? "style" : "wash_day",
        user_id: user.id,
        outcome: "rejected",
        rejection_rule: rule,
      });
    } catch (e) {
      console.warn("[wash-day-tip] outcome flush failed", e);
    }
  };


  // DIAGNOSTIC RUNS NEVER TOUCH THE PRODUCTION CACHE. A harness fingerprint
  // (or an explicit `diagnostic: true`) generates and returns, but is never
  // read from cache and never written to it.
  const isDiagnostic =
    body.diagnostic === true || String(body.fingerprint).startsWith("harness-");

  /** A tip is only cacheable — and only servable from cache — when it carries
   *  BOTH an action and a reason. An empty tip is never good output. */
  const hasSubstance = (p: TipPayload | null | undefined) =>
    !!p &&
    !!String(p.action ?? "").trim() &&
    !!String(p.reason ?? p.why ?? p.technique ?? "").trim();

  // Cache check — same fingerprint = same tip.
  const { data: cached } = isDiagnostic
    ? { data: null }
    : await admin
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
    (cachedPayload.tipsLevel ?? null) === requestedLevel &&
    // READ-TIME GUARD: a hollow cached payload is discarded and regenerated
    // rather than rendered as a bare headline.
    hasSubstance(cachedPayload)
  ) {
    // The cached payload was ALREADY sanitised (citations, style verbatim, blood
    // guardrail) against the grounding passages that produced it before it was
    // stored. Re-running the guardrail here with an empty grounding string was
    // silently deleting the `reason` sentence on every cache hit, because any
    // mechanism wording it contained read as "unsourced" without the passages.
    // Cached tips are served verbatim.
    return json(200, { tip: cachedPayload, cached: true });
  }

  /**
   * LAST-GOOD FALLBACK — when a fresh generation fails, serve the tip she
   * already has (real, guardrail-passed output) marked `stale: true` rather than
   * dead-ending her with a 502. Nothing static or invented is ever returned; if
   * there is no good cached tip we answer honestly with a 503.
   */
  const lastGoodOr503 = (reason: string): Response => {
    console.error(`[wash-day-tip] generation failed (${reason})`);
    if (
      cachedPayload &&
      cachedPayload._model_version === MODEL_VERSION &&
      hasSubstance(cachedPayload)
    ) {
      return json(200, { tip: cachedPayload, cached: true, stale: true });
    }
    return json(503, { error: "guidance_unavailable" });
  };





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
    // NO PRODUCT NAMES reach the model for this card — only the TYPES of
    // product she already has, so the technique can assume what's on hand.
    shelfProductTypes: Array.from(
      new Set(
        (body.shelfProducts ?? [])
          .map((p) => String(p?.category ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 20),
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

  // Universal cornrow guidance — applies to anyone wearing cornrows (any
  // variant), regardless of tension, extensions or hair type.
  const wearingCornrows = /cornrow/i.test(
    `${style.current_hairstyle ?? ""} ${style.planned_next_style ?? ""}`,
  );
  const cornrowBlock = wearingCornrows
    ? `\n\nMANDATORY CORNROW GUIDANCE — this user is in (or moving into) cornrows. Both points below MUST appear in the tip, in Paige's voice, phrased for this user:
1. Clean the scalp that is exposed between the cornrows using a scalp cleanser or cleansing solution on a cotton pad, or ready-made scalp cleansing pads — working along each exposed parting rather than lathering shampoo over the whole style.
2. Keep the ends tucked under safely, or protected with a thick gel or an emollient-based leave-in or cream — applied to the ends and length ONLY, never to the scalp or the exposed partings — to slow the evaporation of moisture from the hair shaft.
Do not substitute other cleansing or sealing methods for these two.`
    : "";


  const ledger = await fetchAdviceLedger(user.id);
  const ledgerBlock = buildAdviceLedgerBlock(ledger);

  const grounding = await buildGroundingBlock({
    surface: isStyle ? "style-tip" : "wash-day-tip",
    proceduralBias: true,
    fn: isStyle ? "style-tip" : "wash-day-tip",
    functionKind: "wash-day-observation",
    selectorContext: selectorCtx,
    forceTopics: isStyle
      ? ["protective-styling", "hair-architecture"]
      : ["wash-day-mechanics", "porosity"],
    ragQuery,
    ragK: 5,
  });

  // NO PRODUCT NAMES + minimal caps. The forbidden-name index is resolved from
  // the database with the service client — never from anything the client sent.
  const wall = await buildProductNameWall(admin as never, user.id, body.shelfProducts ?? []);
  // ONE spec + grounding + the mandatory cornrow guidance + the validated level
  // caps + the anti-repetition ledger. The generic app-wide verbosity block and
  // the separate no-product-names block are NOT appended any more: both are now
  // stated once inside the spec above (rules 2 and 7), which is what stopped the
  // model receiving three different instructions about the same thing.
  const systemPrompt = `${isStyle ? STYLE_SYSTEM : SYSTEM}${grounding.block}${cornrowBlock}${ledgerBlock ? `\n\n${ledgerBlock}` : ""}${tipLevelPromptBlock(requestedLevel)}`;


  let aiResp: Response;
  try {
    aiResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        // Output cap — output tokens drive latency on these interactive surfaces.
        max_tokens: 2400,
        messages: [
          { role: "system", content: systemPrompt },

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
    failOutcome("gateway_unreachable");
    return lastGoodOr503("gateway unreachable");
  }
  if (!aiResp.ok) {
    const text = await aiResp.text().catch(() => "");
    console.error("[wash-day-tip] gateway error:", aiResp.status, text);
    failOutcome(`gateway_${aiResp.status}`);
    if (aiResp.status === 429) return json(429, { error: "rate_limited" });
    if (aiResp.status === 402) return json(402, { error: "credits_exhausted" });
    return lastGoodOr503(`gateway status ${aiResp.status}`);
  }


  const j = await aiResp.json();
  let raw = j?.choices?.[0]?.message?.content ?? "{}";
  type Parsed = { headline?: string; why?: string; reason?: string; technique?: string; action?: string; next_time?: string };
  const parseTip = (text: string): Parsed | null => {
    const attempt = (s: string): Parsed | null => {
      try {
        const v = JSON.parse(s);
        return v && typeof v === "object" ? (v as Parsed) : null;
      } catch {
        return null;
      }
    };
    const direct = attempt(text);
    if (direct) return direct;
    // Tolerate ```json fences or prose around the object.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      const v = attempt(fenced.trim());
      if (v) return v;
    }
    const braced = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return braced.length > 1 ? attempt(braced) : null;
  };
  /** A tip is usable when it has a headline plus at least one body field.
   *  `why` is HAND-HOLDING ONLY, so requiring it 502'd every minimal/essential
   *  request where the model correctly omitted it. */
  const isUsable = (p: Parsed | null) =>
    Boolean(
      String(p?.headline ?? "").trim() &&
        (String(p?.action ?? "").trim() || String(p?.reason ?? "").trim() ||
          String(p?.why ?? "").trim()),
    );

  let parsed = parseTip(raw);

  // ── QUALITY FLOOR ────────────────────────────────────────────────────
  // Every tip, at every support level, must carry one concrete action that
  // references this member's own recorded data. Reject and regenerate once,
  // then log the failure so the rejection rate is visible.
  const attributeTokens = memberAttributeTokens({
    hairProfile: body.hairProfile ?? null,
    currentStyle: body.currentStyle ?? null,
    goals: body.goals,
    challenges: body.challenges,
    areasOfConcern: body.areasOfConcern,
    bloodFlags: body.bloodFlags,
    recentWashDay: body.recentWashDay ?? null,
  });
  const check = (p: Parsed | null) => {
    const actionVerdict = validateTipAction({
      action: String(p?.action ?? ""),
      supporting: [String(p?.headline ?? ""), String(p?.why ?? ""), String(p?.reason ?? "")],
      attributeTokens,
    });
    // The WHY floor: the tip must justify itself, not only instruct.
    const reasonVerdict = validateTipReason({
      reason: String(p?.reason ?? ""),
      action: String(p?.action ?? ""),
    });
    // NO PRODUCT NAMES: the editorial card may never name any product, from
    // any brand, including products this member owns. One hit = regenerate.
    const productHits = findProductNames(p, wall.names);
    // METHOD + ANTI-TAUTOLOGY floor: the tip must name a method (treatment,
    // technique, product type, tool, timing, frequency) and must never justify
    // itself by restating its own headline goal.
    const substanceVerdict = validateTipSubstance({
      headline: String(p?.headline ?? ""),
      body: [String(p?.action ?? ""), String(p?.reason ?? ""), String(p?.next_time ?? "")]
        .filter(Boolean).join(" "),
    });
    // Minimal level word caps, validated.
    const capHits = levelCapViolations(requestedLevel, {
      action: String(p?.action ?? ""),
      reason: String(p?.reason ?? ""),
    });
    return {
      ok: actionVerdict.ok && reasonVerdict.ok &&
        substanceVerdict.ok && productHits.length === 0 && capHits.length === 0,
      reasons: [
        ...actionVerdict.reasons,
        ...reasonVerdict.reasons,
        ...substanceVerdict.reasons,
        ...(productHits.length ? ["names_product"] : []),
        ...capHits,
      ],
    };
  };



  let verdict = isUsable(parsed)
    ? check(parsed)
    : { ok: false, reasons: ["output_unparseable_or_incomplete"] };

  if (!verdict.ok) {
    await logTipRejection(isStyle ? "style-tip" : "wash-day-tip", verdict.reasons, raw.slice(0, 4000));
    // One regeneration pass with the corrective directive. Grounding block is
    // resent unchanged — the retry never relaxes it.
    try {
      const retryResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          // Output cap — output tokens drive latency on these interactive surfaces.
          max_tokens: 2400,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `${styleHeader}\n\nUser data (JSON):\n${JSON.stringify(contextBlock)}\n\nReturn the tip JSON now.`,
            },
            { role: "assistant", content: raw },
            {
              role: "user",
              content: `${retryDirective(verdict.reasons, attributeTokens)}\n\n${methodRetryDirective(verdict.reasons)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (retryResp.ok) {
        const rj = await retryResp.json();
        raw = rj?.choices?.[0]?.message?.content ?? raw;
        const retried = parseTip(raw);
        if (isUsable(retried)) {
          const retryVerdict = check(retried);
          if (retryVerdict.ok) {
            parsed = retried;
            verdict = retryVerdict;
          } else {
            await logTipRejection(
              isStyle ? "style-tip" : "wash-day-tip",
              ["retry_failed", ...retryVerdict.reasons],
              raw.slice(0, 4000),
            );
          }
        }
      }
    } catch (err) {
      console.error("[wash-day-tip] retry pass failed:", err);
    }
  }

  // ── SALVAGE PASS ─────────────────────────────────────────────────────
  // The model sometimes answers with meta-commentary about the JSON rules
  // instead of the object itself (or gets cut off mid-string). Ask once more
  // with a bare, rule-free prompt whose only job is to emit the object.
  if (!isUsable(parsed)) {
    try {
      const salvage = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content:
                "You output one JSON object and nothing else. Shape: " +
                '{"headline":string,"action":string,"reason":string}. ' +
                "headline: max 8 words. action: one concrete instruction, max 30 words. " +
                "reason: the physical mechanism, max 25 words. No product names. No commentary.",
            },
            {
              role: "user",
              content: `${styleHeader}\n\nUser data (JSON):\n${JSON.stringify(contextBlock)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (salvage.ok) {
        const sj = await salvage.json();
        const sRaw = sj?.choices?.[0]?.message?.content ?? "";
        const salvaged = parseTip(sRaw);
        if (isUsable(salvaged)) {
          parsed = salvaged;
          raw = sRaw;
        }
      }
    } catch (err) {
      console.error("[wash-day-tip] salvage pass failed:", err);
    }
  }

  if (!isUsable(parsed)) {
    console.error("[wash-day-tip] unusable model output:", raw.slice(0, 500));
    failOutcome("unusable_model_output");
    return lastGoodOr503("unusable model output");
  }

  // ── GRACEFUL DEGRADATION ─────────────────────────────────────────────
  // Order of degradation (see _shared/tip-level-caps.ts): next_time, then the
  // extended why, then technique. `action` and `reason` NEVER degrade.
  // Only a MISSING ACTION still blocks — that floor stands.
  if (!verdict.ok) {
    // A cap overrun is repairable by trimming, so it never blocks serving.
    const actionOnly = verdict.reasons.filter(
      (r) => (r.startsWith("action_") && r !== "action_over_minimal_cap") ||
        r === "output_unparseable_or_incomplete",
    );
    const hasUsableAction = Boolean(String(parsed.action ?? "").trim()) && actionOnly.length === 0;
    if (!hasUsableAction) {
      failOutcome(`action_floor:${verdict.reasons.slice(0, 3).join(",")}`);
      return json(422, { error: "tip_failed_action_floor", reasons: verdict.reasons });
    }
    await logTipRejection(
      isStyle ? "style-tip" : "wash-day-tip",
      ["served_degraded", ...verdict.reasons],
      raw.slice(0, 4000),
    );
  }


  // The next-wash suggestion is optional by design — an empty/absent value
  // means the section is omitted from the card rather than padded.
  const nextTime = isStyle ? "" : String(parsed.next_time ?? "").trim();
  // THE GRADUATION, ENFORCED SERVER-SIDE. Each level's word budgets are applied
  // here, not merely requested in the prompt, and the fields a level does not
  // show are emptied so they cannot render: the extended `why` and `next_time`
  // are hand-holding only, and `technique` starts at Essential. `reason` is
  // trimmed but never emptied at any level.
  const capped = applyLevelCaps(requestedLevel, {
    action: String(parsed.action ?? ""),
    reason: String(parsed.reason ?? ""),
    technique: "",
    why: String(parsed.why ?? ""),
    next_time: nextTime,
  });

  const payload: TipPayload = {
    headline: String(parsed.headline).trim(),
    why: capped.why,
    action: capped.action,
    reason: capped.reason,
    technique: "",
    next_time: capped.next_time,
    fingerprint: body.fingerprint,
    _model_version: MODEL_VERSION,
    tipsLevel: requestedLevel,
    _manuscript_grounded: grounding.grounded,
    _rag_passages: grounding.passages,
  };

  // ONE OUTPUT CONVENTION — plain text. The cards render strings as text, so a
  // markdown link arrived on screen as literal "[TT Heat Hat](https://…)". This
  // runs BEFORE the name wall so the link's label is checked too.
  const plain = stripMarkdown(payload);

  // NO BRAND NAMES, last line of defence. If any product or brand name survived
  // both passes it is replaced with a generic product-type phrase — the
  // editorial card never advertises, and it never renders empty either.
  const stillNamed = findProductNames(plain, wall.names);
  let finalPayload = stillNamed.length > 0
    ? redactProductNames(plain, stillNamed)
    : plain;
  if (stillNamed.length > 0) {
    await logTipRejection(
      isStyle ? "style-tip" : "wash-day-tip",
      ["redacted_product_name", ...stillNamed.map((n) => n.slice(0, 60))],
      raw.slice(0, 4000),
    );
  }

  // SANITISE BEFORE CACHING. Citation stripping, style-verbatim repair and the
  // blood guardrail all run here, against THIS generation's grounding passages,
  // and the sanitised result is what gets stored and served. Sanitising on read
  // instead (with no grounding to hand) is what was deleting the `reason`.
  finalPayload = await sanitiseAndLog(finalPayload, "wash-day-tip", {

    context: body,
    grounding: grounding.block,
  });

  // THE REASON IS NEVER THE FIELD THAT GOES. If the guardrail emptied it (an
  // ungrounded mechanism phrase, or a blood/hair bridge), ask for ONE
  // replacement sentence written without either, and sanitise that too.
  if (!String(finalPayload.reason ?? "").trim() && String(capped.reason ?? "").trim()) {
    await logTipRejection(
      isStyle ? "style-tip" : "wash-day-tip",
      ["reason_removed_by_guardrail", "repair_attempted"],
      String(capped.reason ?? "").slice(0, 1000),
    );
    try {
      const repairResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          // Output cap — output tokens drive latency on these interactive surfaces.
          max_tokens: 2400,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                `The action for this member is: "${finalPayload.action}"`,
                "Write ONE sentence giving the WHY behind that action for this member — the consequence of skipping it, in plain hair-care terms.",
                "HARD RULES: no physiological mechanism wording (no follicle, cell division, hair shaft, cuticle layer, anagen, protein synthesis, sebum production and the like). Never link a blood marker to a hair outcome. No product or brand names. Grounded in the supplied manuscript passages.",
                'Return JSON only: {"reason": string}',
              ].join("\n"),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (repairResp.ok) {
        const rj = await repairResp.json();
        const repaired = parseTip(rj?.choices?.[0]?.message?.content ?? "{}");
        const candidate = String(repaired?.reason ?? "").trim();
        if (candidate) {
          const safe = await sanitiseAndLog({ reason: candidate }, "wash-day-tip", {
            context: body,
            grounding: grounding.block,
          });
          const safeReason = String(safe.reason ?? "").trim();
          if (safeReason) {
            finalPayload = {
              ...finalPayload,
              reason: applyLevelCaps(requestedLevel, {
                action: finalPayload.action,
                reason: safeReason,
                technique: "",
                why: finalPayload.why,
                next_time: finalPayload.next_time ?? "",
              }).reason,
            };
          }
        }
      }
    } catch (err) {
      console.error("[wash-day-tip] reason repair pass failed:", err);
    }
    if (!String(finalPayload.reason ?? "").trim()) {
      await logTipRejection(
        isStyle ? "style-tip" : "wash-day-tip",
        ["reason_unrecoverable_after_repair"],
        raw.slice(0, 2000),
      );
    }
  }

  // WRITE-TIME GUARD — the cache is for good output only. A payload missing
  // either the action or the reason is never persisted (it would otherwise
  // serve as a bare headline forever), and diagnostic runs never persist at all.
  const cacheable = hasSubstance(finalPayload);
  if (!cacheable) {
    await logTipRejection(
      isStyle ? "style-tip" : "wash-day-tip",
      ["not_cached_empty_action_or_reason"],
      JSON.stringify(finalPayload).slice(0, 2000),
    );
    // AND IT IS NEVER SERVED EITHER. A headline with no action is not a tip:
    // returning it rendered an empty gold card. Fail explicitly so the client
    // falls back to the last tip that did pass the guardrails.
    failOutcome("hollow_after_guardrail");
    return json(422, {
      error: "tip_hollow_after_guardrail",
      ...(isDiagnostic
        ? {
            debug: {
              parsed_action: String(parsed.action ?? ""),
              capped_action: String(capped.action ?? ""),
              after_wall: String((plain as TipPayload).action ?? ""),
              redacted: stillNamed,
              final_action: String(finalPayload.action ?? ""),
              final_reason: String(finalPayload.reason ?? ""),
            },
          }
        : {}),
    });
  }

  if (cacheable && !isDiagnostic) {
    await admin
      .from("ai_summaries")
      .upsert(
        { user_id: user.id, kind, payload: finalPayload },
        { onConflict: "user_id,kind" },
      );
  }

  if (!isDiagnostic) {
    await recordAdvice(user.id, isStyle ? "style-tip" : "wash-day-tip", [finalPayload.headline, finalPayload.action, finalPayload.reason, finalPayload.next_time ?? ""]);
  }

  return json(200, { tip: finalPayload, cached: false, persisted: cacheable && !isDiagnostic });

});


