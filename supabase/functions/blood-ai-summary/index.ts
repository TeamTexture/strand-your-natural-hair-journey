// Generates a hair-health AI summary from blood results.
//
// Phase 2 Step 7 — A/B PARALLEL MODE migration to Claude.
//   STRAND_AI_PROVIDER_BLOOD ∈ { "lovable" (default), "claude", "parallel" }
//
//   - "lovable"  : runs Lovable+Gemini, returns it.
//   - "claude"   : runs Claude Opus only, returns it.
//   - "parallel" : runs BOTH concurrently. Returns Lovable to the user.
//                  Logs BOTH outputs (full payloads) so Paige can compare
//                  side-by-side from real generations before flipping
//                  the user-facing default in Step 7b.
//
// Same response shape: { deficiencies[], overall_summary, priority_actions[] }
// so the existing BloodAiSummary.tsx renderer is unchanged.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
} from "../_shared/advice-ledger.ts";
import { json, preflight } from "../_shared/cors.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { isEntitled, membershipRequired } from "../_shared/entitlement.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-opus-4-7@v4-manuscript-2026-08-09";
// Bump whenever cache-affecting prompt/logic changes (incl. tips-level wiring).
const CACHE_VERSION = "v4-manuscript-2026-08-09";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BloodMarker {
  marker: string;
  value: number | null;
  unit?: string;
  status?: string;
  category?: string;
}

interface RequestBody {
  bloodResults: BloodMarker[];
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
  heritage?: string[];
  force?: boolean;
  context?: Record<string, unknown>;
}

interface Deficiency {
  marker: string;
  value?: string;
  status: "low" | "high" | "borderline";
  hair_impact: string;
  urgency: "low" | "medium" | "high";
}

interface BloodSummaryPayload {
  deficiencies: Deficiency[];
  overall_summary: string;
  priority_actions: string[];
}

const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

// ─── Shared schema (Claude tool_use) ───────────────────────────────────
const RETURN_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["deficiencies", "overall_summary", "priority_actions"],
  properties: {
    deficiencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["marker", "status", "hair_impact", "urgency"],
        properties: {
          marker: { type: "string" },
          value: { type: "string" },
          status: { type: "string", enum: ["low", "high", "borderline"] },
          hair_impact: {
            type: "string",
            description:
              "Factual statement ONLY. Give the marker name, the member's value with its unit, its reference range, and whether it sits inside or outside that range. When it sits outside, add that they should discuss it with their GP. Do NOT state or imply any effect on hair. Do NOT describe any mechanism (nothing about follicles, cells, the hair shaft or growth cycles). Do NOT join the value to any hair action with 'so', 'which is why', 'means', 'affecting' or similar.",
          },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    overall_summary: {
      type: "string",
      description:
        "One short paragraph that reports WHICH markers sit outside their reference range, with values and ranges, and recommends discussing them with a GP. No hair claims, no mechanisms, no causal links.",
    },
    priority_actions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
  },
} as const;

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
  return `You're reporting THIS member's blood results factually. Return JSON only via the return_summary tool.

Follow the BLOOD MARKER RULES in the system block to the letter. They are enforced in code after you reply: any sentence that links a marker to hair, or that describes a physiological mechanism, is deleted before the member sees it.

OUTPUT RULES

1. FACTS ONLY. Each "deficiencies" entry states the marker, the member's value with its unit, its reference range, and that it sits above or below that range. Nothing else. No hair claims. No mechanisms. No causal connectors.

2. CRITICAL COVERAGE RULE. The "deficiencies" array MUST include EVERY marker whose status is "low", "high", or "borderline" — no exceptions, including secondary iron-panel markers (TIBC, transferrin, transferrin saturation, MCV, MCH), thyroid markers, hormones, and any minerals or vitamins flagged.

3. NEVER DIAGNOSE and never interpret. No diagnosis, no treatment, no medication advice, no explanation of what a marker "does". For anything outside the reference range, the recommendation is to discuss it with their GP.

4. OVERALL_SUMMARY. A short factual paragraph naming which markers sit outside range, with the numbers, and a plain recommendation to take the results to a GP. No pattern narrative, no hair implications.

5. PRIORITY_ACTIONS. Exactly 3. They may cover taking results to a GP, retesting timing, and general food or lifestyle habits — but must not claim any hair outcome from a blood value.

6. TREND. When context.bloodPanels holds more than one panel (newest first), you may state the direction and the numbers of a change between panels. You may NOT state what that trend means for hair. Never invent a trend for markers absent from both panels.

7. Plain English. Translate a clinical term on first use with a neutral definition only — never with what it does for hair.

8. Never name a book, chapter or page.`;
}

async function runClaude(args: {
  body: RequestBody;
  recentWashSignals: unknown[];
  ledgerBlock?: string;
}): Promise<BloodSummaryPayload> {
  const userText = `User-supplied profile:
${JSON.stringify({
  bloodResults: (args.body.bloodResults ?? []).filter((b) => b.value != null || b.status),
  hairProfile: args.body.hairProfile ?? {},
  healthProfile: args.body.healthProfile ?? {},
  heritage: args.body.heritage ?? [],
}, null, 2)}

Full user context (currentStyle, goals, challenges, hairProfile, healthProfile, bloodResults, location, professional, history.flagged_ingredients):
${JSON.stringify(args.body.context ?? {}, null, 2)}

Recent wash days where the user reported scalp/hair-feel signals (often correlate with iron/D/zinc trends):
${JSON.stringify(args.recentWashSignals, null, 2)}

Return JSON only via the return_summary tool.`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const req = await buildClaudeRequest({
    function_kind: "blood-ai-summary",
    task_instructions: `${buildClaudeTaskInstructions()}${
      args.ledgerBlock ? `\n\n${args.ledgerBlock}` : ""
    }`,
    user_payload: {},
    user_content: userContent,
    user_context: args.body.context ?? null,
    selector_context: buildSelectorContext(args.body.context ?? {}),
    force_topic_ids: [
      "iron-and-shedding",
      "vits-and-minerals",
      "thyroid",
      "hormones-and-life-stage",
      "diagnosed-conditions",
    ],
    rag_query: `blood markers hair loss shedding ferritin iron vitamin D thyroid ${
      (Array.isArray((args.body as Record<string, unknown>).flaggedMarkers)
        ? ((args.body as Record<string, unknown>).flaggedMarkers as Array<Record<string, unknown>>)
            .map((m) => m.marker ?? m.name ?? "")
            .filter(Boolean)
            .join(" ")
        : "")
    }`.trim(),
    rag_k: 5,
    tool: {
      name: "return_summary",
      description: "Return the structured hair-health blood summary. Always invoke exactly once.",
      input_schema: RETURN_SUMMARY_SCHEMA as unknown as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_summary" },
    // Opus needs headroom: every flagged marker gets its own mechanism-first
    // sentence + the joined-up summary + 3 priority actions. 4096 truncated
    // mid tool_use on rich blood panels.
    max_tokens: 8192,
  });

  console.log("[blood-debug] before model call", { provider: "claude" });
  const result = await callClaude<BloodSummaryPayload>(req);
  console.log(
    JSON.stringify({
      function: "blood-ai-summary",
      provider: "claude",
      stop_reason: result.stop_reason,
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
    }),
  );
  console.log("[blood-debug] model call done", { provider: "claude" });

  if (!result.toolInput) {
    throw new Error("Claude returned no return_summary tool_use block");
  }
  const p = result.toolInput as Partial<BloodSummaryPayload>;
  const payload: BloodSummaryPayload = {
    deficiencies: Array.isArray(p.deficiencies) ? p.deficiencies as Deficiency[] : [],
    overall_summary: typeof p.overall_summary === "string" ? p.overall_summary : "",
    priority_actions: Array.isArray(p.priority_actions) ? p.priority_actions as string[] : [],
  };

  if (!payload.overall_summary || payload.priority_actions.length === 0) {
    throw new Error(
      `Claude returned incomplete summary (stop_reason=${result.stop_reason}, deficiencies=${payload.deficiencies.length}, summary_len=${payload.overall_summary.length}, actions=${payload.priority_actions.length})`,
    );
  }
  return payload;
}

import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "blood-ai-summary", stage: 2 } as const;


// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(body: RequestBody, ledgerBlock = ""): Promise<{
  payload: BloodSummaryPayload;
  status: number;
  /** Retrieved manuscript text, so the blood guardrail can verify that any
   *  mechanism wording in the output is traceable to the manuscript. */
  groundingText: string;
}> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  // Manuscript grounding parity with the Claude path.
  const groundingCtx = {
    hairProfile: body.hairProfile ?? {},
    healthProfile: body.healthProfile ?? {},
    bloodResults: body.bloodResults ?? [],
  } as Record<string, unknown>;
  const grounding = await buildGroundingBlock({
    surface: "blood-ai-summary",
    fn: "blood-ai-summary",
    functionKind: "blood-ai-summary",
    selectorContext: selectorFromAiContext(groundingCtx),
    forceTopics: [
      "iron-and-shedding",
      "vits-and-minerals",
      "thyroid",
      "hormones-and-life-stage",
      "diagnosed-conditions",
    ],
    ragQuery: ragQueryFromAiContext(
      groundingCtx,
      "blood markers shedding regrowth follicle ferritin iron vitamin thyroid hormones",
    ),
    ragK: 5,
  });

  const userPayload = {
    bloodResults: (body.bloodResults ?? []).filter((b) => b.value != null || b.status),
    hairProfile: body.hairProfile ?? {},
    healthProfile: body.healthProfile ?? {},
    heritage: body.heritage ?? [],
    context: body.context ?? null,
  };

  const systemPrompt = `${STRAND_PERSONA}

${CHAPTER_WHITELIST_PROMPT}

TASK
Analyse these blood test results and return JSON only via the provided tool. Use STRAND's professional advisory voice.
Hair-health guidance only. Recommend the user also seek GP support for any medical concern — never refuse to advise.

Follow the BLOOD MARKER RULES in the system block exactly. Each hair_impact field is a FACTUAL statement only: the marker, the value with its unit, its reference range, and whether it sits inside or outside that range — plus, when outside, that the member should discuss it with their GP. No hair claims, no mechanisms, no causal connectors. The overall_summary reports which markers sit outside range with their numbers and recommends a GP conversation. No pleasantries, praise or hype.

CRITICAL COVERAGE RULE:
- The "deficiencies" array MUST include EVERY blood marker whose status is "low", "high", or "borderline" — no exceptions.
- Includes secondary iron-panel markers (TIBC, transferrin, transferrin saturation, MCV, MCH), thyroid markers (TSH, T3, T4), hormones, and any minerals/vitamins flagged.
- Never silently skip a flagged marker because it's "less common" or "related to another one already mentioned". Each flagged marker gets its own factual entry.
- The "overall_summary" lists every marker outside range with its value and range, then recommends discussing the results with a GP. No pattern interpretation, no hair implications.
- Never name any source manuscript, author, chapter or page.
- "priority_actions" must not claim a hair outcome from any blood value.

TREND ANALYSIS (when context.bloodPanels contains more than one panel):
- context.bloodPanels is ordered newest-first. The first entry is the CURRENT test. Any subsequent entries are previous tests, each with a "deltas" array listing per-marker change vs the panel BEFORE it.
- When a previous panel exists, the "overall_summary" may state the direction (rising / falling) and the numbers. It may NOT state what that trajectory means for hair.
- If a previously-flagged marker has normalised, say so plainly. If a marker has worsened, say so plainly. No hair implication either way.
- Never invent a trend — only comment on markers that appear in both the current and prior panel.`;

  const aiResp = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: `${systemPrompt}${grounding.block}\n\n${buildTipsLevelBlock((body.context as Record<string, unknown> | null | undefined)?.tipsLevel)}${ledgerBlock ? `\n\n${ledgerBlock}` : ""}` },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_summary",
            description: "Return the structured hair health summary.",
            parameters: {
              type: "object",
              properties: {
                deficiencies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      marker: { type: "string" },
                      value: { type: "string" },
                      status: { type: "string", enum: ["low", "high", "borderline"] },
                      hair_impact: { type: "string" },
                      urgency: { type: "string", enum: ["low", "medium", "high"] },
                    },
                    required: ["marker", "status", "hair_impact", "urgency"],
                  },
                },
                overall_summary: { type: "string" },
                priority_actions: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 3,
                },
              },
              required: ["deficiencies", "overall_summary", "priority_actions"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_summary" } },
    }),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const aiJson = await aiResp.json();
  const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("Malformed AI output (no tool_call from Lovable+Gemini)");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as Partial<BloodSummaryPayload>;
  return {
    payload: {
      deficiencies: Array.isArray(parsed.deficiencies) ? parsed.deficiencies as Deficiency[] : [],
      overall_summary: typeof parsed.overall_summary === "string" ? parsed.overall_summary : "",
      priority_actions: Array.isArray(parsed.priority_actions) ? parsed.priority_actions as string[] : [],
      _manuscript_grounded: grounding.grounded,
      _rag_passages: grounding.passages,
    } as BloodSummaryPayload,
    status: aiResp.status,
    groundingText: grounding.block,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const t0 = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: "Unauthorized" });
    // Paid feature: a lapsed membership loses AI guidance.
    if (!(await isEntitled(user.id))) return membershipRequired();

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { force, bloodResults } = body;
    const requestedTipsLevel =
      typeof (body.context as Record<string, unknown> | undefined)?.tipsLevel === "number"
        ? ((body.context as Record<string, unknown>).tipsLevel as number)
        : null;

    const provider = readAiProvider("STRAND_AI_PROVIDER_BLOOD");
    const flagged = (bloodResults ?? []).filter(
      (b) => b.status && ["low", "high", "borderline"].includes(b.status),
    );
    console.log("[blood-debug] start", {
      user_id: user.id,
      provider,
      hasBloodResults: (bloodResults ?? []).length > 0,
      num_flagged: flagged.length,
    });

    // Cache (existing pattern: one row per user/kind, no _sig in legacy code).
    // We keep the existing key for the user-facing payload. In parallel mode
    // we *additionally* write a sidecar row (kind = "blood_summary_claude_shadow")
    // so Paige can compare cached Claude outputs without re-running.
    if (!force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .eq("kind", "blood_summary")
        .maybeSingle();
      const existingPayload = existing?.payload as Record<string, unknown> | null;
      const cacheFresh =
        !!existingPayload &&
        existingPayload._cache_version === CACHE_VERSION &&
        (existingPayload._tips_level ?? null) === requestedTipsLevel;
      if (cacheFresh) {
        console.log("[blood-debug] cache hit", { total_ms: Date.now() - t0 });
        return json(200, {
          cached: true,
          summary: await sanitiseAndLog(existingPayload, "blood-ai-summary", { context: body.context }),
        });
      }
    }

    // Pull recent wash signals (shedding/breakage notes) for Claude context.
    const recentWashSignals = await (async () => {
      if (provider === "lovable") return [];
      const { data: recentRaw } = await supabase
        .from("wash_days")
        .select("wash_date, scalp_feel, breakage, hair_feel_note")
        .eq("user_id", user.id)
        .order("wash_date", { ascending: false })
        .limit(15);
      return (recentRaw ?? [])
        .filter((r) => {
          const note = (r as { hair_feel_note?: string | null }).hair_feel_note;
          const sf = (r as { scalp_feel?: string | null }).scalp_feel;
          const br = (r as { breakage?: string | null }).breakage;
          return (note && note.trim().length > 0) || sf || br;
        })
        .slice(0, 5);
    })();

    const ledgerBlock = buildAdviceLedgerBlock(await fetchAdviceLedger(user.id));

    let returnedPayload: BloodSummaryPayload;
    let providerStamp: "claude" | "lovable";
    let claudeShadow: BloodSummaryPayload | null = null;
    // Retrieved manuscript text for this generation. Passed to the blood
    // guardrail so mechanism wording is kept only when it IS in the manuscript.
    let groundingText = "";

    if (provider === "claude") {
      returnedPayload = await runClaude({ body, recentWashSignals, ledgerBlock });
      providerStamp = "claude";
    } else if (provider === "parallel") {
      // Return Lovable to the user as soon as it lands. The Claude shadow
      // run is fired off in the background so the user never waits for it.
      console.log("[blood-debug] before model call", { provider: "parallel" });
      const shadowPromise = runClaude({ body, recentWashSignals, ledgerBlock })
        .then((payload) => {
          console.log(
            JSON.stringify({
              function: "blood-ai-summary",
              mode: "parallel",
              claude: {
                ok: true,
                summary_len: payload.overall_summary.length,
                deficiencies: payload.deficiencies.length,
                actions: payload.priority_actions.length,
                model_version: MODEL_VERSION,
              },
            }),
          );
          console.log("[blood-debug] parallel.claude.payload", JSON.stringify(payload));
          return payload;
        })
        .catch((err) => {
          console.log(
            JSON.stringify({
              function: "blood-ai-summary",
              mode: "parallel",
              claude: {
                ok: false,
                error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
              },
            }),
          );
          return null;
        });

      const lovableRun = await runLovable(body, ledgerBlock);
      groundingText = lovableRun.groundingText;
      console.log("[blood-debug] model call done", { provider: "parallel" });
      console.log(
        JSON.stringify({
          function: "blood-ai-summary",
          mode: "parallel",
          lovable: {
            ok: true,
            summary_len: lovableRun.payload.overall_summary.length,
            deficiencies: lovableRun.payload.deficiencies.length,
            actions: lovableRun.payload.priority_actions.length,
            status: lovableRun.status,
          },
        }),
      );
      console.log(
        "[blood-debug] parallel.lovable.payload",
        JSON.stringify(lovableRun.payload),
      );

      returnedPayload = lovableRun.payload;
      providerStamp = "lovable";

      // Persist the shadow after the response has been sent.
      const cacheShadow = async () => {
        const payload = await shadowPromise;
        if (!payload) return;
        const shadowStamped = {
          ...payload,
          _generated_at: new Date().toISOString(),
          _provider: "claude",
          _model_version: MODEL_VERSION,
          _shadow: true,
        } as Record<string, unknown>;
        const { data: priorShadow } = await supabase
          .from("ai_summaries")
          .select("id")
          .eq("user_id", user.id)
          .eq("kind", "blood_summary_claude_shadow")
          .maybeSingle();
        if (priorShadow?.id) {
          await supabase
            .from("ai_summaries")
            .update({ payload: shadowStamped, updated_at: new Date().toISOString() })
            .eq("id", priorShadow.id);
        } else {
          await supabase.from("ai_summaries").insert({
            user_id: user.id,
            kind: "blood_summary_claude_shadow",
            payload: shadowStamped,
          });
        }
      };
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
        .EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(cacheShadow());
      else void cacheShadow();
    } else {

      const r = await runLovable(body, ledgerBlock);
      groundingText = r.groundingText;
      returnedPayload = r.payload;
      providerStamp = "lovable";
    }

    // Stamp + upsert primary cache.
    const stamped = {
      ...returnedPayload,
      _generated_at: new Date().toISOString(),
      _provider: providerStamp,
      _cache_version: CACHE_VERSION,
      _tips_level: requestedTipsLevel,
      ...(providerStamp === "claude" ? { _model_version: MODEL_VERSION } : {}),
    } as Record<string, unknown>;

    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "blood_summary")
      .maybeSingle();

    if (prior?.id) {
      await supabase
        .from("ai_summaries")
        .update({ payload: stamped, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await supabase
        .from("ai_summaries")
        .insert({ user_id: user.id, kind: "blood_summary", payload: stamped });
    }

    // Sidecar shadow cache for parallel mode.
    if (claudeShadow) {
      const shadowStamped = {
        ...claudeShadow,
        _generated_at: new Date().toISOString(),
        _provider: "claude",
        _model_version: MODEL_VERSION,
        _shadow: true,
      } as Record<string, unknown>;
      const { data: priorShadow } = await supabase
        .from("ai_summaries")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "blood_summary_claude_shadow")
        .maybeSingle();
      if (priorShadow?.id) {
        await supabase
          .from("ai_summaries")
          .update({ payload: shadowStamped, updated_at: new Date().toISOString() })
          .eq("id", priorShadow.id);
      } else {
        await supabase
          .from("ai_summaries")
          .insert({
            user_id: user.id,
            kind: "blood_summary_claude_shadow",
            payload: shadowStamped,
          });
      }
    }

    await recordAdvice(
      user.id,
      "blood-ai-summary",
      returnedPayload.priority_actions ?? [],
    );

    console.log("[blood-debug] all done", {
      total_ms: Date.now() - t0,
      mode: provider,
      returned_provider: providerStamp,
      claude_shadow_cached: !!claudeShadow,
    });

    return json(200, {
      cached: false,
      summary: await sanitiseAndLog(stamped, "blood-ai-summary", {
            context: body.context,
        grounding: groundingText,
      }),
    });
  } catch (e) {
    console.log("[blood-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "blood-ai-summary");
  }
});
