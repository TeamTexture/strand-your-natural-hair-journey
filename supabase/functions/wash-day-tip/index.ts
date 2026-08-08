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
  memberAttributeTokens,
  validateTipAction,
  validateTipReason,
  retryDirective,
  logTipRejection,
} from "../_shared/tip-action.ts";
import {
  buildProductNameWall,
  noProductNamesBlock,
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

const MODEL_VERSION = "wash-tip@v10-no-product-names";

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
  "action": string,     // REQUIRED. Exactly ONE sentence, starting with an instruction verb, telling THIS member what to physically do on their NEXT wash day — where on the head, with what type of product, and how long or how often. Must name at least one of their own recorded details (their current style, porosity, density, a goal, a challenge or their last wash). This sentence is shown at EVERY support level, including the most minimal, so it must stand alone as usable guidance.
  "reason": string,     // REQUIRED. ONE sentence explaining WHY that action matters for THIS member — the mechanism it works through, or what happens to their hair if it is skipped. It must EXPLAIN, never restate the action. Grounded in the supplied manuscript passages. Shown at EVERY support level alongside the action.
  "why": string,        // 2-3 sentences. Ties the tip to THIS user's data (name a specific trait, pattern across their logs, marker, or goal). No filler.
  "technique": string,  // 1-2 sentences. The concrete "how" — sequence, product type, tool, timing.
  "next_time": string   // OPTIONAL. 1-2 sentences framed as ONE option to try on their NEXT wash day, given where their hair is now and the style they are moving into. Return "" when there is nothing genuinely worth suggesting — never pad it.
}

RULES:
- Do NOT invent user data. If a slice is missing, ground the tip in what IS present.
- Reason from PATTERNS across all their logs (recurring breakage, how often heat appears, how their cadence is drifting, which products they rotate) rather than from the most recent wash alone.
- Where their own words about how their hair feels are present, reflect them back accurately. Never overwrite what they said with an assumption.
- PRODUCTS: name NO products and NO brands, ever. This card is purely educational. Refer to product TYPES generically ("a water-based scalp cleanser", "a leave-in conditioner", "an emollient cream") — never a branded product, not even one this member owns.
- If bloodFlags include ferritin/iron/vitD-low, connect wash-day scalp care to the regrowth environment.
- If hair porosity is high, lead with sealing/moisture-lock; if low, lead with clarifying/heat-assisted penetration.
- Never prescribe pre-poo as a scheduled ritual. Never say "use protein weekly". Never recommend shower caps, plastic caps, warm towels, or steamers — the only heat tool referenced is the TT Heat Hat (teamtexture.co.uk).
- Never contradict the Chapter 13 wash-day protocol (cleanse scalp → cleanse hair → condition).
- No book/chapter citations. No emojis. No pleasantries.
- REASON FLOOR — non-negotiable: "reason" is never empty and never a reworded version of "action". It explains the mechanism or the consequence, and it must be supported by the supplied manuscript passages. If the WHY cannot be grounded, choose a DIFFERENT tip whose why CAN be grounded — never drop the why.
- The minimum shape at every support level is: headline + action + reason. Two sentences is enough at the most minimal level.
- ACTION FLOOR — non-negotiable: "action" is never empty, never a topic statement, and never a hedge. Do not open it with "consider", "be mindful", "it's important to", "you may want to" or "try to remember". It is an instruction they can follow on their next wash day.
- Everything you write must stay grounded in the supplied manuscript passages. If an action cannot be grounded, choose a different grounded action — never emit an ungrounded one, and never fall back to a headline with no action.
`;

const STYLE_SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Produce ONE personalised styling tip for this specific user, grounded in the STRAND manuscript teachings and their live data (hair profile, health signals, blood flags, goals, current and planned style, style tension, whether extensions are in). This is the tip shown on their Current Hairstyle screen until their data changes.

OUTPUT — JSON object only, no prose outside it:
{
  "headline": string,   // 3-7 words, Title Case, no trailing punctuation.
  "action": string,     // REQUIRED. Exactly ONE sentence, starting with an instruction verb, telling THIS member what to physically do next — naming at least one of their own recorded details. Shown at EVERY support level, so it must stand alone as usable guidance. Never a hedge ("consider", "be mindful", "it's important to").
  "reason": string,     // REQUIRED. ONE sentence explaining WHY that action matters for THIS member — the mechanism, or what happens if it is skipped. Explains, never restates the action. Grounded in the supplied manuscript passages. Shown at EVERY support level.
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
  const editorialBlock = noProductNamesBlock();
  const minimalBlock = tipLevelPromptBlock(requestedLevel);
  const systemPrompt = `${isStyle ? STYLE_SYSTEM : SYSTEM}${grounding.block}${cornrowBlock}\n\n${buildTipsLevelBlock((body as unknown as Record<string, unknown>).tipsLevel)}${ledgerBlock ? `\n\n${ledgerBlock}` : ""}${editorialBlock}${minimalBlock}`;

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
      supporting: [String(p?.headline ?? ""), String(p?.why ?? ""), String(p?.reason ?? ""), String(p?.technique ?? "")],
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
    // Minimal level word caps, validated.
    const capHits = levelCapViolations(requestedLevel, {
      action: String(p?.action ?? ""),
      reason: String(p?.reason ?? ""),
      technique: String(p?.technique ?? ""),
    });
    return {
      ok: actionVerdict.ok && reasonVerdict.ok && productHits.length === 0 &&
        capHits.length === 0,
      reasons: [
        ...actionVerdict.reasons,
        ...reasonVerdict.reasons,
        ...(productHits.length ? ["names_product"] : []),
        ...capHits,
      ],
    };
  };


  let verdict = parsed?.headline && parsed?.why
    ? check(parsed)
    : { ok: false, reasons: ["output_unparseable_or_incomplete"] };

  if (!verdict.ok) {
    await logTipRejection(isStyle ? "style-tip" : "wash-day-tip", verdict.reasons, raw.slice(0, 4000));
    // One regeneration pass with the corrective directive. Grounding block is
    // resent unchanged — the retry never relaxes it.
    try {
      const retryResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `${styleHeader}\n\nUser data (JSON):\n${JSON.stringify(contextBlock)}\n\nReturn the tip JSON now.`,
            },
            { role: "assistant", content: raw },
            { role: "user", content: retryDirective(verdict.reasons, attributeTokens) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (retryResp.ok) {
        const rj = await retryResp.json();
        raw = rj?.choices?.[0]?.message?.content ?? raw;
        const retried = parseTip(raw);
        if (retried?.headline && retried?.why) {
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

  if (!parsed?.headline || !parsed?.why) {
    return json(502, { error: "invalid model output" });
  }
  // ── GRACEFUL DEGRADATION ─────────────────────────────────────────────
  // A weak "why" is acceptable; no tip is not. Only a MISSING ACTION still
  // blocks — that floor stands. Any reason-only failure is logged and the
  // tip is served anyway.
  if (!verdict.ok) {
    // A cap overrun is repairable by trimming, so it never blocks serving.
    const actionOnly = verdict.reasons.filter(
      (r) => (r.startsWith("action_") && r !== "action_over_minimal_cap") ||
        r === "output_unparseable_or_incomplete",
    );
    const hasUsableAction = Boolean(String(parsed.action ?? "").trim()) && actionOnly.length === 0;
    if (!hasUsableAction) {
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
  // are hand-holding only, and `technique` starts at Essential.
  const capped = applyLevelCaps(requestedLevel, {
    action: String(parsed.action ?? ""),
    reason: String(parsed.reason ?? ""),
    technique: String(parsed.technique ?? ""),
    why: String(parsed.why ?? ""),
    next_time: nextTime,
  });

  const payload: TipPayload = {
    headline: String(parsed.headline).trim(),
    why: capped.why,
    action: capped.action,
    reason: capped.reason,
    technique: capped.technique,
    next_time: capped.next_time,
    fingerprint: body.fingerprint,
    _model_version: MODEL_VERSION,
    tipsLevel: requestedLevel,
    _manuscript_grounded: grounding.grounded,
    _rag_passages: grounding.passages,
  };

  // NO PRODUCT NAMES, last line of defence. If any product name survived both
  // passes it is replaced with a generic product-type phrase — the editorial
  // card never advertises, and it never renders empty either.
  const stillNamed = findProductNames(payload, wall.names);
  const finalPayload = stillNamed.length > 0
    ? redactProductNames(payload, stillNamed)
    : payload;
  if (stillNamed.length > 0) {
    await logTipRejection(
      isStyle ? "style-tip" : "wash-day-tip",
      ["redacted_product_name", ...stillNamed.map((n) => n.slice(0, 60))],
      raw.slice(0, 4000),
    );
  }

  await admin
    .from("ai_summaries")
    .upsert(
      { user_id: user.id, kind, payload: finalPayload },
      { onConflict: "user_id,kind" },
    );

  await recordAdvice(user.id, isStyle ? "style-tip" : "wash-day-tip", [finalPayload.headline, finalPayload.action, finalPayload.reason, finalPayload.technique, finalPayload.next_time ?? ""]);

  return json(200, {
    tip: await sanitiseAndLog(finalPayload, "wash-day-tip", { context: body, grounding: grounding.block }),
    cached: false,
  });
});

