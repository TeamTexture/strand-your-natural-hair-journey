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

interface NextWashTip {
  action: string;
  why: string;
}
interface ObservationPayload {
  observation: string;
  next_wash_tip?: NextWashTip | string;
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
      type: "object",
      additionalProperties: false,
      required: ["action", "why"],
      properties: {
        action: {
          type: "string",
          description:
            "ONE clear, imperative action for the user's NEXT wash day. Max 18 words. Starts with a verb. No preamble, no hedging. Names a specific product/tool from their shelf/wishlist/tools when possible.",
        },
        why: {
          type: "string",
          description:
            "The explanation for the action, 2-3 short sentences. Grounds the reasoning in the STRAND core teachings (How To Love Your Afro) AND ties it to at least one concrete signal from the user's profile or today's wash day (porosity, scalp feel, breakage, style, goal, product outcome). Plain English, no chapter/page citations.",
        },
      },
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
PART 2 — NEXT WASH DAY TIP (field: next_wash_tip — object with { action, why })
=========================================
This is the primary value the user reads. Do NOT re-analyse today. Focus 100% on what to DO next wash day.

FIELD: action
- ONE clear, imperative sentence. Max 18 words. Starts with a verb ("Lead with…", "Swap…", "Skip…", "Deep-condition under…").
- Concrete and doable in one wash session.
- Name at least ONE specific product from context.shelf/wishlist OR a specific tool from context.tools, by name. Never invent items they don't have.
- If suggesting heat, ONLY the TT Heat Hat (https://www.teamtexture.co.uk). Never plastic caps, shower caps, warm towels, or steamers.
- ABSOLUTE: NEVER recommend a protein, keratin, bond-repair or "strengthening" treatment on any cadence (no weekly, fortnightly, monthly, "every X washes", or scheduled protein of any kind). Afro hair is protein-rich (keratin); default to moisture. Only mention a protein step as a one-off if the user's own data shows fresh chemical processing or documented heat damage — never as part of a routine.
- No hedging ("you might want to", "perhaps", "if you feel like it").

FIELD: why
- 2-3 short sentences explaining the reasoning.
- MUST be grounded in the STRAND core teachings from the CORE TEACHINGS block (drawn from How To Love Your Afro). Reason from the manuscript's framework — do not import outside hair-care lore.
- MUST tie the reasoning to at least ONE concrete signal from the user (porosity, density, scalp condition today, breakage today, style choice, a specific product outcome, a goal, a chemical history flag, a blood marker). Say WHY it matters for THIS user.
- Plain English. Never name the manuscript, chapters, or page numbers.
- Never medical advice.`;
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
    rag_query: `wash day routine cleanse condition moisture scalp ${
      (args.body.results as Record<string, unknown> | undefined)?.scalpFeel ?? ""
    } ${(args.body.results as Record<string, unknown> | undefined)?.hairFeel ?? ""} ${
      args.body.hairFeelNote ?? ""
    }`.trim(),
    rag_k: 4,
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
Given a single wash day log + the user's profile, return TWO fields via the tool:
1) observation (2-3 sentences): REFLECT on today only — a specific product, scalp feel, breakage, hair feel — tied to hair profile / blood / meds where relevant. No forward-looking advice.
2) next_wash_tip: an object with { action, why }.
   - action: ONE clear imperative sentence (max 18 words) for the NEXT wash day. Starts with a verb. Names a specific product from context.shelf/wishlist OR a specific tool from context.tools. Never invent items the user doesn't have.
   - why: 2-3 short sentences explaining the reasoning. MUST be grounded in the STRAND core teachings from How To Love Your Afro AND tied to at least ONE concrete signal from the user (porosity, scalp today, breakage today, style, goal, product outcome). Plain English, no chapter/page citations.
   - If suggesting heat, ONLY reference the TT Heat Hat (https://www.teamtexture.co.uk) — never plastic caps, shower caps, warm towels, or steamers.
   - ABSOLUTE: NEVER suggest a protein/keratin/bond-repair/"strengthening" treatment on any cadence — no weekly, fortnightly, monthly, or scheduled protein of any kind. Default to moisture. A protein step is only ever a one-off after fresh chemical processing or documented heat damage.
- Direct, professional, no hedging. Plain English. No medical advice.
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
              description: "Return the wash-day observation + next-wash tip.",
              parameters: {
                type: "object",
                properties: {
                  observation: { type: "string", description: "2-3 sentence reflection on today." },
                  next_wash_tip: {
                    type: "object",
                    properties: {
                      action: { type: "string", description: "One imperative sentence, max 18 words." },
                      why: { type: "string", description: "2-3 sentence explanation grounded in HTLA teachings + a user-specific signal." },
                    },
                    required: ["action", "why"],
                  },
                },
                required: ["observation", "next_wash_tip"],
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
  const parsed = JSON.parse(toolCall.function.arguments) as {
    observation?: string;
    next_wash_tip?: NextWashTip | string;
  };
  return {
    observation: parsed.observation ?? "",
    next_wash_tip:
      typeof parsed.next_wash_tip === "string"
        ? { action: parsed.next_wash_tip, why: "" }
        : parsed.next_wash_tip ?? { action: "", why: "" },
  };
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
