// Personalised explanation for why this specific user might benefit from a
// heat treatment during conditioning.
//
// Phase 2 Step 5b: dual-path — Lovable+Gemini (legacy) and Claude Haiku (new),
// gated by STRAND_AI_PROVIDER_HEAT_RATIONALE. Defaults to "lovable".
//
// Also fixes two bugs from the legacy file flagged in PHASE_2_AUDIT.md
// lines 572-573:
//   1. broken `corsHeaders` import from `@supabase/supabase-js/cors`
//      → now uses the standard _shared/cors.ts helpers
//   2. hardcoded fake fallback rationale on AI failure
//      → now surfaces a real error via aiErrorResponse

import { json, preflight } from "../_shared/cors.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap } from "../_shared/usage-cap.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { STYLE_WEIGHTING_RULES } from "../_shared/style-weighting.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-haiku-4-5@v2-manuscript-2026-08-09";

interface Body {
  context?: Record<string, unknown> | null;
}

interface RationalePayload {
  headline: string;
  reasons: string[];
}

const RETURN_RATIONALE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "reasons"],
  properties: {
    headline: {
      type: "string",
      description:
        "Short headline (max 9 words) leading with the verdict — why heat could help THIS user specifically.",
    },
    reasons: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string", description: "One concrete bullet, max ~16 words." },
    },
  },
} as const;

import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "heat-treatment-rationale", stage: 2 } as const;


function buildSelectorContext(ctx: Record<string, unknown>): SelectorContext {
  const hp = (ctx.hairProfile as Record<string, unknown>) ?? {};
  const hl = (ctx.healthProfile as Record<string, unknown>) ?? {};
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
  return {
    hair: {
      porosity: arr(hp.porosity),
      density: arr(hp.density),
      scalp: arr(hp.scalp_condition),
      diagnosed: arr(hp.diagnosed_conditions),
    },
    health: {
      lifeStage: arr(hl.life_stage),
      contraception: arr(hl.contraception),
      conditions: arr(hl.medical_conditions),
    },
    bloodResults: Array.isArray(ctx.bloodResults) ? (ctx.bloodResults as unknown[]) : [],
    location: (ctx.location as Record<string, unknown>) ?? {},
  };
}

function buildClaudeTaskInstructions(): string {
  return `You're explaining why applying heat with a TT Heat Hat over a deep conditioner could help THIS specific user during conditioning. They just said they did NOT use heat today. Return JSON only via the return_rationale tool. The ONLY heat tool you may name is the TT Heat Hat — never a plastic cap, shower cap, warm towel, generic heated cap, steamer, or hooded dryer. Never paste or mention a raw website URL in the copy.

Voice for this task: follow the VOICE PRINCIPLES from the system block. The headline lands the verdict; each reason bullet should still read like a clinician thinking out loud — show the mechanism, then the consequence ("warmth lifts the cuticle, which means the conditioner sits where it can actually soften the cortex"). Connectives over commands. "You" not "your hair". Translate any specialist term the first time it appears in a bullet.

OUTPUT RULES

1. Lead with the VERDICT — one short headline (max 9 words). Then 2-3 reason bullets (max ~16 words each). Each bullet links one specific user signal to a mechanism, using a connective.

2. Ground every bullet in the user's actual data: porosity, density, scalp condition, diagnosed conditions, goals, challenges, recent wash signals, or low blood markers when mechanism-relevant. The style may be named as recorded fact, but never as the mechanism itself. Never invent data — if a field is missing, don't reference it.

2a. NEVER ATTRIBUTE A CHARACTERISTIC THAT IS NOT IN THE DATA. If porosity, density, texture, elasticity or scalp condition is absent from hairProfile, do not name it at all — not even hedged, speculative or conditional ("especially if your hair tends toward lower porosity", "if you're low porosity", "hair like yours probably..."). A hedged guess still reads to the member as insight about her hair. Where you would have used a missing field, either leave it out entirely or say plainly "once you've added your porosity" / "once your hair characteristics are on file".

3. Reference the user's goals and challenges only when the mechanism connects. The style may be stated as a fact of where she is ("before it goes up for several weeks") — never as a technique or a verdict, and never as the reason on its own.

4. If a "consistently flagged" ingredient appeared in their recent products, you may reference it ONLY if it's mechanism-relevant. Use the phrase "consistently flagged in your history" — never "avoid list" or "your avoids."

5. Hair-health guidance only — never medical advice. No tension/lab/sleep/dermatologist references unless mechanism-relevant.

6. Moisture comes from water. Heat helps the cuticle lift so conditioning ingredients SEAL the moisture deeper — it doesn't add moisture.

7. NO chapter citations. NO "Read more — How To Love Your Afro" links.

8. Plain English, no jargon. Treat the user as a capable adult who knows their hair.

STYLE — RECORDED FACT ONLY (carve-out for this task):
You MAY name the style the member has on her head, or the one she recorded doing, as a plain statement of fact — what she did, what is there now. That is the ONLY thing the style earns. The teaching itself stays general: no style-specific technique, no style-specific verdict, no cadence attached to a style. Everything below applies to the guidance you generate.

${STYLE_WEIGHTING_RULES}`;
}


/**
 * DETERMINISTIC BACKSTOP — never present an inference as insight.
 *
 * The model has been told not to name a hair characteristic that is absent
 * from the profile, including hedged forms ("especially if your hair tends
 * toward lower porosity"). Prompts are not guarantees, so any bullet that
 * names a characteristic we do not actually hold is dropped here, and the
 * hedged clause is stripped when the rest of the bullet still stands on its
 * own. Nothing is rewritten beyond removing the unsupported clause.
 */
const CHARACTERISTIC_TERMS: Record<string, RegExp> = {
  porosity: /porosity|porous/i,
  density: /\bdensit(y|ies)\b/i,
  elasticity: /\belasticity\b/i,
  texture: /\b(hair )?texture\b/i,
  scalp_condition: /\bscalp condition\b/i,
};

function missingCharacteristics(ctx: Record<string, unknown>): string[] {
  const hp = (ctx.hairProfile as Record<string, unknown>) ?? {};
  const present = (v: unknown) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;
  return Object.keys(CHARACTERISTIC_TERMS).filter((k) => !present(hp[k]));
}

export function stripUnsupportedCharacteristics(
  payload: RationalePayload,
  ctx: Record<string, unknown>,
): RationalePayload {
  const missing = missingCharacteristics(ctx);
  if (missing.length === 0) return payload;
  const patterns = missing.map((k) => CHARACTERISTIC_TERMS[k]);
  const names = missing.join(",");

  const cleanBullet = (text: string): string | null => {
    if (!patterns.some((re) => re.test(text))) return text;
    // Try dropping just the offending clause.
    const parts = text.split(/\s*(?:—|–|,|;)\s*/).filter(Boolean);
    const kept = parts.filter((part) => !patterns.some((re) => re.test(part)));
    const rebuilt = kept.join(", ").trim().replace(/[\s,;]+$/, "");
    // Only keep a repaired bullet if it still says something substantial.
    if (kept.length > 0 && rebuilt.split(/\s+/).length >= 5) {
      return rebuilt.endsWith(".") ? rebuilt : `${rebuilt}.`;
    }
    return null;
  };

  const reasons = payload.reasons
    .map((r) => (typeof r === "string" ? cleanBullet(r) : null))
    .filter((r): r is string => !!r && r.trim().length > 0);

  let headline = payload.headline;
  if (patterns.some((re) => re.test(headline ?? ""))) {
    headline = "Heat could get more out of your conditioner";
  }

  if (reasons.length !== payload.reasons.length || headline !== payload.headline) {
    console.log(JSON.stringify({
      event: "unsupported_characteristic_stripped",
      fn: "heat-treatment-rationale",
      missing: names,
      reasons_before: payload.reasons.length,
      reasons_after: reasons.length,
    }));
  }

  // Never return an empty rationale: fall back to a claim that needs no
  // characteristic on file at all.
  if (reasons.length === 0) {
    reasons.push(
      "Warmth helps the cuticle lift, so the conditioner reaches further into the strand.",
      "Once you've added your hair characteristics, this gets specific to you.",
    );
  }
  return { ...payload, headline, reasons: reasons.slice(0, 3) };
}

async function runClaude(args: {
  context: Record<string, unknown>;
}): Promise<RationalePayload> {
  const userText = `User context (currentStyle, goals, challenges, hairProfile, healthProfile, bloodResults, history.flagged_ingredients, location, recent wash days):
${JSON.stringify(args.context, null, 2)}

Return JSON only via the return_rationale tool.`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const req = await buildClaudeRequest({
    function_kind: "heat-treatment-rationale",
    task_instructions: buildClaudeTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.context,
    selector_context: buildSelectorContext(args.context),
    force_topic_ids: ["heat-and-moisture", "porosity", "wash-day-mechanics"],
    procedural_bias: true,
    rag_query: "heat application deep conditioning moisture retention porosity Afro hair TT Heat Hat",
    rag_k: 4,
    tool: {
      name: "return_rationale",
      description: "Return the personalised heat-treatment rationale. Always invoke exactly once.",
      input_schema: RETURN_RATIONALE_SCHEMA as unknown as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_rationale" },
    max_tokens: 1024,
  });

  console.log("[heat-debug] before model call");
  const result = await callClaude<RationalePayload>(req);
  console.log(
    JSON.stringify({
      function: "heat-treatment-rationale",
      provider: "claude",
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
    }),
  );
  console.log("[heat-debug] model call done");

  if (!result.toolInput) {
    throw new Error("Claude returned no return_rationale tool_use block");
  }
  const p = result.toolInput;
  return {
    headline: p.headline ?? "",
    reasons: Array.isArray(p.reasons) ? p.reasons.slice(0, 3) : [],
  };
}

// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(args: {
  context: Record<string, unknown>;
}): Promise<RationalePayload> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK
The user is logging a wash day and just said they did NOT use heat while conditioning. Explain — grounded ONLY in the data provided — why applying heat with a TT Heat Hat over a deep conditioner could help THEM specifically. The ONLY heat tool you may name is the TT Heat Hat — never a plastic cap, shower cap, warm towel, generic heated cap, steamer, or hooded dryer. Never paste or mention a raw website URL in the copy.

Rules:
- Be concrete. Reference their actual hair type/porosity/density, goals, challenges, recent wash notes, or low blood markers when relevant. The style may be named as recorded fact only, never as the mechanism.
- Never invent data. If a field is missing, don't mention it — and never name a missing characteristic speculatively or conditionally ("especially if your hair tends toward lower porosity", "if you're low porosity"). A hedge is still an inference presented as insight. Say "once you've added your porosity" instead, or omit it.
- 1 short headline (max 9 words) and 2-3 bullets (max ~16 words each).
- Never name any source manuscript, author, chapter or page. Speak the guidance directly in your own voice.
- Output ONLY JSON: { "headline": string, "reasons": string[] }

STYLE — RECORDED FACT ONLY (carve-out for this task):
You MAY name the style the member has on her head, or the one she recorded doing, as a plain statement of fact — what she did, what is there now. That is the ONLY thing the style earns. The teaching itself stays general: no style-specific technique, no style-specific verdict, no cadence attached to a style. Everything below applies to the guidance you generate.

${STYLE_WEIGHTING_RULES}`;

  const groundingCtx = (args.context ?? null) as Record<string, unknown> | null;
  const grounding = await buildGroundingBlock({
    surface: "heat-treatment-rationale",
    fn: "heat-treatment-rationale",
    functionKind: "heat-treatment-rationale",
    selectorContext: selectorFromAiContext(groundingCtx),
    forceTopics: ["heat-and-moisture","porosity","wash-day-mechanics"],
    ragQuery: ragQueryFromAiContext(groundingCtx, "heat application deep conditioning moisture retention porosity"),
    ragK: 4,
  });

  const res = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: `${SYSTEM}${grounding.block}` },
        {
          role: "user",
          content: `Here is the user's data context. Ground the rationale in it.\n\n${JSON.stringify(args.context)}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { headline?: string; reasons?: string[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Malformed AI output");
  }
  return {
    headline: parsed.headline ?? "",
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const kill = checkKillSwitch();
  if (kill) return kill;


  // Paid AI generation — signed-in members only.
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;

  const t0 = Date.now();
  try {
    // Spend protection: per-user daily cap (model-spend paths only).
    const capped = await checkDailyCap(auth.user.id, "heat-treatment-rationale", 40);
    if (capped) return capped;

    const body = (await req.json().catch(() => ({}))) as Body;
    const context = (body.context ?? {}) as Record<string, unknown>;

    console.log("[heat-debug] start", {
      currentStyle: context.currentStyle ?? null,
      hasGoals: Array.isArray(context.goals) && context.goals.length > 0,
    });

    const provider = readAiProvider("STRAND_AI_PROVIDER_HEAT_RATIONALE");

    let payload: RationalePayload;
    let providerStamp: "claude" | "lovable";
    if (provider === "claude") {
      payload = await runClaude({ context });
      providerStamp = "claude";
    } else {
      payload = await runLovable({ context });
      providerStamp = "lovable";
    }

    payload = stripUnsupportedCharacteristics(payload, context);

    const result = await sanitiseAndLog({
      ...payload,
      ...({
        _model_version: providerStamp === "claude" ? MODEL_VERSION : undefined,
        _generated_at: new Date().toISOString(),
        _provider: providerStamp,
      } as Record<string, unknown>),
    }, "heat-treatment-rationale", { context });

    console.log("[heat-debug] all done", { total_ms: Date.now() - t0, provider: providerStamp });
    return json(200, result);
  } catch (e) {
    console.log("[heat-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "heat-treatment-rationale");
  }
});
