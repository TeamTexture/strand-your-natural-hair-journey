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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { json, preflight } from "../_shared/cors.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-opus-4-7@v1";

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
              "Mechanism-first sentence: explain in plain English what this marker does at the follicle/blood/scalp level, then bridge with 'which is why' / 'so' / 'this means' to what it means for the user. Talk to 'you', not 'your hair'. Translate any clinical term on first use.",
          },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    overall_summary: {
      type: "string",
      description:
        "One short paragraph in Paige's voice that names the joined-up pattern across flagged markers. Coach explaining the picture, not a list.",
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
  return `You're writing a hair-health interpretation of THIS user's blood results. Return JSON only via the return_summary tool.

Voice for this task: follow the VOICE PRINCIPLES from the system block. Every hair_impact sentence should read like a clinician thinking out loud — start with the MECHANISM in plain English ("Ferritin is your iron storage tank, the reservoir your follicles draw from for new growth"), then bridge with a connective ("which is why", "so", "this means") into what it means for THIS user's hair right now. Talk to "you", not "your hair". Translate any clinical term the FIRST time it appears in any field — "ferritin (your iron stores)", "TIBC (how much iron your blood can carry)", "TSH (the signal your thyroid takes orders from)", etc.

OUTPUT RULES

1. EXPLANATION-FIRST. Never lead with a verdict like "This is low — eat more X." Lead with the mechanism, then the user's value lands as the obvious conclusion.

2. CRITICAL COVERAGE RULE. The "deficiencies" array MUST include EVERY marker whose status is "low", "high", or "borderline" — no exceptions. That includes secondary iron-panel markers (TIBC, transferrin, transferrin saturation, MCV, MCH), thyroid markers (TSH, free T3, free T4), hormones, and any minerals/vitamins flagged. Never silently skip a marker because it's "less common" or "downstream of another." Each flagged marker gets its own entry with its own mechanism-first hair_impact sentence.

3. SCOPE. Hair-health guidance only. The markers that genuinely move hair are: ferritin, iron panel, vitamin D, B12, folate, zinc, biotin, omega-3 ratio, thyroid (TSH, T3, T4), and HbA1c only when relevant to androgenic patterns (e.g. PCOS-driven thinning). Anything beyond those — note the value and that it's flagged, but say plainly that the hair impact isn't direct and the user should raise it with a clinician.

4. NEVER DIAGNOSE. No medical diagnosis, no treatment recommendation, no medication advice. Refer back to a clinician for anything beyond hair impact and food/lifestyle levers.

5. OVERALL_SUMMARY. One short paragraph (3-4 sentences) that names the JOINED-UP pattern, not a list. e.g. "Low ferritin alongside low vitamin D and high TSH is the iron-and-thyroid loop showing up at once — ferritin feeds new growth, vitamin D regulates the follicle cycle, and a sluggish thyroid slows the whole system down. That combination is why you're likely seeing diffuse shedding rather than patchy loss." Speak in your own voice — never name a chapter, manuscript, or page.

6. PRIORITY_ACTIONS. Exactly 3 actions. Each one short, concrete, and addressing the COMBINED picture (not a single marker in isolation). Reference the user's heritage / diet / medication / current style only when mechanism-relevant.

7. PERSONALISATION. Anchor in the user's CURRENT hair situation: current style, active goals, stated challenges, recent wash signals if shedding/breakage was reported. Don't reach back to past styles or past goals. If a field is missing, don't reference it — never invent data.

8. NO chapter citations. NO "Read more — How To Love Your Afro" links.

9. Plain English, no jargon without immediate translation. Treat the user as a capable adult who knows her body.`;
}

async function runClaude(args: {
  body: RequestBody;
  recentWashSignals: unknown[];
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
    task_instructions: buildClaudeTaskInstructions(),
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

// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(body: RequestBody): Promise<{
  payload: BloodSummaryPayload;
  status: number;
}> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const userPayload = {
    bloodResults: (body.bloodResults ?? []).filter((b) => b.value != null || b.status),
    hairProfile: body.hairProfile ?? {},
    healthProfile: body.healthProfile ?? {},
    heritage: body.heritage ?? [],
    context: body.context ?? null,
  };

  const systemPrompt = `${STRAND_PERSONA}

${VOICE_PRINCIPLES}

${CHAPTER_WHITELIST_PROMPT}

TASK
Analyse these blood test results and return JSON only via the provided tool. Speak as Paige.
Hair-health guidance only. Recommend the user also seek GP support for any medical concern — never refuse to advise.

Voice for this task: follow the VOICE PRINCIPLES above. In each hair_impact sentence, lead with the mechanism (what this marker does at the follicle / blood / scalp level, in plain English), then bridge with a connective ("which is why", "so", "this means") into what it means for the user. Talk to "you", not "your hair". Translate any clinical term on first use. The overall_summary reads like a coach explaining the joined-up picture, not a list of values.

CRITICAL COVERAGE RULE:
- The "deficiencies" array MUST include EVERY blood marker whose status is "low", "high", or "borderline" — no exceptions.
- Includes secondary iron-panel markers (TIBC, transferrin, transferrin saturation, MCV, MCH), thyroid markers (TSH, T3, T4), hormones, and any minerals/vitamins flagged.
- Never silently skip a flagged marker because it's "less common" or "related to another one already mentioned". Each flagged marker gets its own entry with its own hair_impact sentence.
- The "overall_summary" must explicitly acknowledge the FULL pattern (e.g. "low ferritin AND low TIBC together suggest…"), not just the headline marker.
- Speak the overall_summary directly in your own science-backed voice. Never name any source manuscript, author, chapter or page.
- "priority_actions" must address the combined picture, not a single deficiency in isolation.`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
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
    },
    status: aiResp.status,
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

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { force, bloodResults } = body;

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
      if (existing?.payload) {
        console.log("[blood-debug] cache hit", { total_ms: Date.now() - t0 });
        return json(200, {
          cached: true,
          summary: sanitiseChapterCitationsDeep(existing.payload),
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

    let returnedPayload: BloodSummaryPayload;
    let providerStamp: "claude" | "lovable";
    let claudeShadow: BloodSummaryPayload | null = null;

    if (provider === "claude") {
      returnedPayload = await runClaude({ body, recentWashSignals });
      providerStamp = "claude";
    } else if (provider === "parallel") {
      // Run BOTH concurrently. Return Lovable to the user. Log both fully.
      console.log("[blood-debug] before model call", { provider: "parallel" });
      const [lovableRes, claudeRes] = await Promise.allSettled([
        runLovable(body),
        runClaude({ body, recentWashSignals }),
      ]);
      console.log("[blood-debug] model call done", { provider: "parallel" });

      const lovableOk = lovableRes.status === "fulfilled";
      const claudeOk = claudeRes.status === "fulfilled";
      const lovablePayload = lovableOk ? lovableRes.value.payload : null;
      const claudePayload = claudeOk ? claudeRes.value : null;

      // Compact metadata line (easy to grep).
      console.log(
        JSON.stringify({
          function: "blood-ai-summary",
          mode: "parallel",
          lovable: lovableOk
            ? {
                ok: true,
                summary_len: lovablePayload!.overall_summary.length,
                deficiencies: lovablePayload!.deficiencies.length,
                actions: lovablePayload!.priority_actions.length,
                status: lovableRes.value.status,
              }
            : {
                ok: false,
                error: (lovableRes.reason instanceof Error
                  ? lovableRes.reason.message
                  : String(lovableRes.reason)).slice(0, 200),
              },
          claude: claudeOk
            ? {
                ok: true,
                summary_len: claudePayload!.overall_summary.length,
                deficiencies: claudePayload!.deficiencies.length,
                actions: claudePayload!.priority_actions.length,
                model_version: MODEL_VERSION,
              }
            : {
                ok: false,
                error: (claudeRes.reason instanceof Error
                  ? claudeRes.reason.message
                  : String(claudeRes.reason)).slice(0, 200),
              },
        }),
      );

      // Full payloads for Paige to read side-by-side.
      console.log(
        "[blood-debug] parallel.lovable.payload",
        JSON.stringify(lovablePayload ?? { _error: true }),
      );
      console.log(
        "[blood-debug] parallel.claude.payload",
        JSON.stringify(claudePayload ?? { _error: true }),
      );

      if (!lovableOk) {
        // Parallel mode contract: Lovable failures bubble up to the user.
        // Claude failures are logged-only.
        throw lovableRes.reason;
      }
      returnedPayload = lovablePayload!;
      providerStamp = "lovable";
      claudeShadow = claudePayload;
    } else {
      const r = await runLovable(body);
      returnedPayload = r.payload;
      providerStamp = "lovable";
    }

    // Stamp + upsert primary cache.
    const stamped = {
      ...returnedPayload,
      _generated_at: new Date().toISOString(),
      _provider: providerStamp,
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

    console.log("[blood-debug] all done", {
      total_ms: Date.now() - t0,
      mode: provider,
      returned_provider: providerStamp,
      claude_shadow_cached: !!claudeShadow,
    });

    return json(200, {
      cached: false,
      summary: sanitiseChapterCitationsDeep(stamped),
    });
  } catch (e) {
    console.log("[blood-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "blood-ai-summary");
  }
});
