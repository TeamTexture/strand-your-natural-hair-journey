// Generates a 2-3 sentence personalised observation about the user's wash day.
// Phase 2 Step 5a: dual-path — Lovable+Gemini (legacy) and Claude Haiku (new),
// gated by STRAND_AI_PROVIDER_WASH_OBSERVATION. Defaults to "lovable".
//
// Clean port: no scraping, no images, no schema overhaul. Returns the same
// `{ observation: string }` shape so the existing client (WashStep4.tsx) is
// unchanged. Wash days are one-shot per save → no caching.

import { json, preflight } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-haiku-4-5@v1";

interface RequestBody {
  steps?: Record<string, unknown>;
  results?: Record<string, unknown>;
  hairFeelNote?: string;
  hairProfile?: Record<string, unknown>;
  healthProfile?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

interface ObservationPayload {
  observation: string;
}

const RETURN_OBSERVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observation"],
  properties: {
    observation: {
      type: "string",
      description:
        "2-3 sentence personalised wash-day observation in Paige's voice. Lead with one concrete next step. Reference the user's CURRENT style/goals/challenges only when mechanism-relevant. May reference specific past wash days by date if patterns are visible.",
    },
  },
} as const;

function buildSelectorContext(body: RequestBody): SelectorContext {
  const ctx = body.context ?? {};
  const hp = (body.hairProfile ?? (ctx.hairProfile as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const hl = (body.healthProfile ?? (ctx.healthProfile as Record<string, unknown>) ?? {}) as Record<string, unknown>;
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
  return `You're writing ONE personalised observation about the user's wash day, in Paige's voice (2-3 sentences MAX). Return JSON only via the return_observation tool.

OUTPUT RULES (apply Step 3 personalisation rules):
1. Lead with one concrete next-wash action the user can take, NOT generic affirmations ("Great job!", "Keep going!" — banned).
2. Reference the user's CURRENT style, goals, and challenges only when they're mechanism-relevant to today's wash. Don't shoehorn them in.
3. If you spot a pattern across the supplied recent wash days, cite the SPECIFIC days by date or sequence ("Your last 3 wash days using [product] all reported limp hair", "Twice in the past month after using heat without a steamer your scalp felt tight"). Do NOT use vague summaries like "you sometimes report dryness".
4. If a "consistently flagged" ingredient (from history.flagged_ingredients) appears in today's products, note it directly. NEVER use the phrases "avoid list", "your avoids", or "ingredients to avoid" — use "consistently flagged in your history".
5. Do NOT cite tension/styling concerns, lab values, sleep, cortisol, or dermatologist context unless they directly intersect today's wash mechanics.
6. Hair-health guidance only — never medical advice.
7. Moisture comes from water. Products SEAL it, don't add it.

Citation rule: when guidance is rooted in the book, use "Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]" on its own line at the end. Never name the book or author elsewhere.`;
}

async function runClaude(args: {
  body: RequestBody;
  recentWashDays: unknown[];
  selectorContext: SelectorContext;
}): Promise<{ payload: ObservationPayload }> {
  const userText = `Today's wash day:
${JSON.stringify({ steps: args.body.steps ?? {}, results: args.body.results ?? {}, hairFeelNote: args.body.hairFeelNote ?? "" }, null, 2)}

Recent wash days (most recent first, for pattern spotting):
${JSON.stringify(args.recentWashDays, null, 2)}

User context (currentStyle, goals, challenges, hairProfile, healthProfile, bloodResults, history.flagged_ingredients, location):
${JSON.stringify(args.body.context ?? {}, null, 2)}

Return JSON only via the return_observation tool.`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const req = await buildClaudeRequest({
    function_kind: "wash-day-observation",
    task_instructions: buildClaudeTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.body.context ?? null,
    selector_context: args.selectorContext,
    force_topic_ids: ["wash-day-mechanics", "porosity", "scalp-conditions"],
    tool: {
      name: "return_observation",
      description: "Return the wash-day observation. Always invoke exactly once.",
      input_schema: RETURN_OBSERVATION_SCHEMA as unknown as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_observation" },
    max_tokens: 1024,
  });

  console.log("[wash-debug] before model call");
  const result = await callClaude<ObservationPayload>(req);
  const byName = result.server_tool_use_by_name ?? {};
  console.log(
    JSON.stringify({
      function: "wash-day-observation",
      provider: "claude",
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
      web_search_invocations: byName["web_search"] ?? 0,
    }),
  );

  if (!result.toolInput) {
    throw new Error("Claude returned no return_observation tool_use block");
  }
  return { payload: result.toolInput };
}

// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(args: {
  body: RequestBody;
  bloodRows: unknown[];
  medRows: unknown[];
}): Promise<ObservationPayload> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const userPayload = {
    ...args.body,
    bloodResults: args.bloodRows,
    medications: args.medRows,
    context: args.body.context ?? null,
  };

  const systemPrompt = `${STRAND_PERSONA_WITH_RULES}

${CHAPTER_WHITELIST_PROMPT}

TASK
Given a single wash day log + the user's profile, write ONE personalised observation as Paige (2-3 sentences max).
- Reference SPECIFIC choices the user made (a product, scalp feel, breakage level, hair feel note) — not generic advice.
- Tie at least one observation back to the user's hair profile (porosity, scalp condition, diagnosed conditions) or a flagged blood marker / medication when relevant.
- Encouraging, never preachy. Plain English. No medical advice.
- Return JSON only via the provided tool.`;

  const aiResp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_observation",
              description: "Return the wash-day observation.",
              parameters: {
                type: "object",
                properties: {
                  observation: { type: "string", description: "2-3 sentence personalised note." },
                },
                required: ["observation"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_observation" } },
      }),
    },
  );

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
    throw new Error("Malformed AI output");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as { observation?: string };
  return { observation: parsed.observation ?? "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const t0 = Date.now();
  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const body = (await req.json()) as RequestBody;
    console.log("[wash-debug] start", { user_id: user.id });

    {
      const ac = (body.context ?? {}) as Record<string, unknown>;
      const goalsArr = Array.isArray(ac.goals) ? (ac.goals as Array<Record<string, unknown>>) : [];
      console.log("[ai-context-server] received", {
        currentStyle: ac.currentStyle ?? null,
        currentGoals: goalsArr.map((g) => g.title).filter(Boolean),
        currentChallenges: goalsArr.map((g) => g.challenge).filter(Boolean),
      });
    }

    const provider = readAiProvider("STRAND_AI_PROVIDER_WASH_OBSERVATION");

    // Pull blood + meds for richer context (used by both paths).
    const [{ data: bloodRows }, { data: medRows }] = await Promise.all([
      supabase
        .from("blood_results")
        .select("marker, value, unit, status")
        .eq("user_id", user.id),
      supabase
        .from("user_medications")
        .select("name, category")
        .eq("user_id", user.id),
    ]);

    let result: ObservationPayload;

    if (provider === "claude") {
      // Pull last 10 wash days for pattern context (Claude path only —
      // significantly better at structured-array pattern spotting).
      const { data: recentRaw } = await supabase
        .from("wash_days")
        .select("wash_date, steps, heat_treatment, scalp_feel, breakage, style_after, hair_feel_note, ai_insight")
        .eq("user_id", user.id)
        .order("wash_date", { ascending: false })
        .limit(10);

      const { payload } = await runClaude({
        body,
        recentWashDays: recentRaw ?? [],
        selectorContext: buildSelectorContext(body),
      });
      result = {
        ...payload,
        // Provenance — kept on the response object for client logs but
        // ignored by the legacy renderer (only reads `observation`).
        ...({
          _model_version: MODEL_VERSION,
          _generated_at: new Date().toISOString(),
          _provider: "claude",
        } as Record<string, unknown>),
      } as ObservationPayload;
    } else {
      const lovable = await runLovable({
        body,
        bloodRows: bloodRows ?? [],
        medRows: medRows ?? [],
      });
      result = {
        ...lovable,
        ...({
          _generated_at: new Date().toISOString(),
          _provider: "lovable",
        } as Record<string, unknown>),
      } as ObservationPayload;
    }

    console.log("[wash-debug] all done", { total_ms: Date.now() - t0 });
    return json(200, sanitiseChapterCitationsDeep(result));
  } catch (e) {
    console.log("[wash-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "wash-day-observation");
  }
});
