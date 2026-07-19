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
  next_wash_tip?: string;
}

const RETURN_OBSERVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observation", "next_wash_tip"],
  properties: {
    observation: {
      type: "string",
      description:
        "2-3 sentence personalised wash-day observation. REFLECTS on today only — no advice, no 'next time'.",
    },
    next_wash_tip: {
      type: "string",
      description:
        "2-3 sentence CONCRETE, forward-looking tip for the user's NEXT wash day. Reference specific products on their shelf/wishlist, specific tools they own, and their stated goals. Name at least one specific product OR tool OR technique. This is where advice belongs.",
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
  return `You're writing TWO short professional pieces about the user's wash day. Return JSON only via the return_observation tool.

Voice: follow VOICE PRINCIPLES from the system block. Mechanism-first, talk to "you", translate any specialist term, professional and direct, never over-familiar.

=========================================
PART 1 — OBSERVATION (field: observation)
=========================================
2-3 sentences MAX. REFLECT, do not advise. Describes what the user did today and how it compares to recent wash days.

RULES:
- Lead with a SPECIFIC choice the user made today (a product, technique, step skipped, heat treatment, styling decision) and what effect it had — using their reported scalp feel, breakage, hair feel note, and styling outcome.
- Where possible, compare today to a SPECIFIC pattern in recent wash days. Cite by date/sequence ("3rd wash in past 4 weeks where X", "Last time you used [product] on [date], you reported [outcome]").
- If a "consistently flagged" ingredient appeared in today's products, name it. NEVER say "avoid list" — say "consistently flagged in your history."
- NEVER tell the user what to do next in this field. No "try X next time", "consider Y", "going forward" — that belongs in PART 2.
- Hair-health observation only, never medical advice.
- BANNED PHRASES in observation: "Great job!", "Keep it up!", "Nice work!", "Try [X] next time," "Consider," "I'd recommend."

=========================================
PART 2 — NEXT WASH DAY TIP (field: next_wash_tip)
=========================================
2-3 sentences MAX. Concrete, forward-looking advice for the user's NEXT wash day.

RULES:
- Use context.shelf, context.wishlist, context.tools, context.goals, and today's outcome to design the tip.
- Name at least ONE specific product from their shelf OR wishlist OR a specific tool they own — by name. Do not invent products they don't have.
- Tie the tip to something concrete from today (e.g. "Because breakage was moderate today and your goal is length retention, next wash try leading with [Product X from shelf] before your co-wash…").
- Give a mechanism ("this coats the cuticle before manipulation, which reduces mid-shaft snapping").
- If they logged heat today, and heat is due next wash, ONLY reference the TT Heat Hat (link https://www.teamtexture.co.uk). Never suggest plastic caps, shower caps, warm towels, or steamers.
- If there's a wishlist item that would genuinely help, you may suggest picking it up — but never sound salesy.
- NO chapter citations. NO "Read more" links. Plain English.
- BANNED in tip: "you might want to", "perhaps", "if you feel like it" — be direct and confident.`;
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
