// Generates a 2-3 sentence personalised observation about the user's wash day.
// Phase 2 Step 5a: dual-path — Lovable+Gemini (legacy) and Claude Haiku (new),
// gated by STRAND_AI_PROVIDER_WASH_OBSERVATION. Defaults to "lovable".
//
// Clean port: no scraping, no images, no schema overhaul. Returns the same
// `{ observation, next_wash_tip }` shape. The client foregrounds next_wash_tip;
// observation is retained for storage/provenance. Wash days are one-shot per
// save → no caching.

import { json, preflight } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude, type ContentBlockInput } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
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
            "SHORT HEADER for the tip card — 2 to 6 words, Title Case, no trailing punctuation. Names the core move (e.g. 'Repeat your current sequence', 'Deep-condition under TT Heat Hat', 'Lead with moisture'). NOT a full sentence. The full explanation goes in `why`.",
        },
        why: {
          type: "string",
          description:
            "The body of the tip that explains the header. 2-4 short sentences (~55 words max). Tie to the user's own data (specific recent wash, product, or goal) and ground the reasoning in a How To Love Your Afro teaching without naming the book. May use short labelled paragraphs like 'Why it matters:', 'Technique:', 'Moisture:', 'Product consistency:' to break up the body.",
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

NON-NEGOTIABLE MANUSCRIPT RULES:
- Baseline wash day = at least TWO shampoo cleanses before conditioning unless the user's data clearly needs adaptation: cleanse 1 is scalp-focused with a cleansing/all-purpose shampoo; cleanse 2 is hair-focused with a moisturising/conditioning shampoo; then conditioner. For protective styles, adapt the same principle with diluted shampoo/nozzle scalp cleansing or an appropriate scalp cleanser — do not skip cleansing.
- Wash-day products need 3–4 wash cycles before judging them. If the user's products are working, neutral, or only used 1–3 cycles, the advice is to KEEP the same product sequence and observe the pattern — do not suggest changing products.
- Only suggest changing/replacing/rotating a product early when the user's own data shows a clear negative reaction: irritation, persistent dryness, build-up, stiffness, increased breakage, or a repeated poor outcome tied to that product/ingredient.
- If hair feels dry, high porosity is present, or the season/humidity could be drying the hair, use moisture-first guidance: water, conditioner slip, sectioning, and a moisture-focused deep conditioning mask when needed. Do not default to protein.
- NEVER recommend scheduled protein, keratin, strengthening, bond-repair, or scheduled pre-poo.

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
This is the primary value the user reads on the home screen. Be SUCCINCT. Do not re-analyse today.

FIELD: action  (this is the CARD HEADER, not the tip itself)
- SHORT header only: 3 to 7 words, Title Case, NO trailing period.
- HOLISTIC: the header must capture or allude to the WHOLE direction of the tip, not just one step. If the body covers a cleanse + mask + heat step, the header signals the overall arc (e.g. "Reset, Mask And Seal Moisture", "Cleanse Gently, Deep-Condition Under Heat", "Repeat Sequence, Add Midweek Moisture"). A reader should not finish the body thinking "the header only told me half of that".
- May pair two linked moves with a comma or "and" ("Cleanse And Deep-Condition", "Protect Ends, Lead With Moisture"). Group thematically rather than listing three separate moves.
- May include ONE specific product or tool name from context.shelf / context.tools when it is central to the overall move. Never invent items.
- If suggesting heat anywhere in the tip, write exactly "TT Heat Hat" — never generic "heat cap", plastic cap, shower cap, warm towel, or steamer.
- ABSOLUTE: never a protein, keratin, or bond-repair treatment on any cadence.
- Do NOT write a full imperative sentence. Do NOT append a "because…" clause — the explanation lives in \`why\`.
- HEADER↔BODY ALIGNMENT (STRICT + HOLISTIC): draft \`why\` first, then write a header that covers ALL the moves \`why\` recommends, weighted toward the primary one.
  • If \`why\` centres on a mask + TT Heat Hat after a gentle cleanse, the header names the mask/heat arc AND hints at the cleanse ("Cleanse Then Deep-Condition Under Heat").
  • If \`why\` says keep the same shampoo/conditioner sequence and add a midweek moisture top-up, the header reflects both ("Repeat Sequence, Add Midweek Moisture").
  • If \`why\` is only about protecting ends / low manipulation, the header names that single move.
  • Never mention only the cleanse in the header when the body's real emphasis is a mask/heat step (or vice versa). Never leave the primary move out of the header.
  Before returning, reread: could a reader summarise the body from just the header? If not, rewrite the header so it covers the whole arc.

FIELD: why  (this is the BODY that explains the header)
- 2 to 4 short sentences, ~55 words max. Plain, conversational English.
- Break it up with short labelled sub-paragraphs when it helps readability. Recognised labels: "Why it matters:", "Technique:", "Moisture:", "Product consistency:", "Goal focus:", "Scalp signal:", "Watch for:".
- Tie the reasoning to a concrete pattern the user can verify in their own data: name a recent wash ("last wash", "your wash on 12 July"), a repeated signal (scalp feel, breakage, hair-feel note), a product outcome they've logged, or their active goal by title. Do NOT invent history.
- Ground the reasoning in a How To Love Your Afro teaching, referenced by mechanism not by name. Draw from: the two-cleanse baseline (scalp-focused cleansing shampoo first, moisturising/conditioning shampoo through the hair second, then conditioner); the 3-4 wash-cycle consistency rule; moisture-first response for high porosity / humidity / dry hair; low-manipulation and ends-tucking for length retention; scalp-first (clean, calm, well-circulated) for growth; no scheduled protein — moisture leads. If recommending a deep conditioning mask, frame it as a moisture response, never as a routine change.
- Do NOT name the manuscript, chapters, or page numbers. Do NOT say "the book says".
- No medical advice.\`;
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
Given a single wash day log + the user's profile, return TWO fields via the tool. The client UI foregrounds next_wash_tip, so make that the most useful part.
1) observation (1-2 sentences): REFLECT on today only — a specific product, scalp feel, breakage, hair feel — tied to hair profile / blood / meds where relevant. No forward-looking advice.
2) next_wash_tip: an object with { action, why }. BE SUCCINCT — this is a home-screen card, not a paragraph.
   - action: SHORT CARD HEADER only — 2 to 6 words, Title Case, no trailing period. Names the core move ("Repeat Your Current Sequence", "Deep-Condition Under TT Heat Hat", "Lead With Moisture"). Not a full sentence. May include one specific product/tool name from context.shelf / context.tools when that IS the core move. Never invent items.
   - Core rule: wash-day products need 3–4 wash cycles before judging them. If the product outcome is working, neutral, or only 1–3 cycles in, the header should say to keep/repeat the current sequence. Do NOT suggest changing products after two washes unless the user's own data shows a clear negative reaction.
   - why: THE BODY that explains the header. 2 to 4 short sentences (~55 words max), plain English. May use short labelled sub-paragraphs: "Why it matters:", "Technique:", "Moisture:", "Product consistency:", "Goal focus:", "Scalp signal:", "Watch for:".
     • Tie to a concrete pattern in the user's own data — a recent wash day (name the date or "last wash"), a repeated signal, a product outcome they've logged, OR their active goal by title. Do not invent history.
      • Ground the reasoning in an explicit How To Love Your Afro teaching (two cleanses before conditioning: scalp-focused cleansing shampoo first, moisturising/conditioning shampoo through the hair second; 3–4 wash-cycle consistency; moisture-first for high porosity/humidity; low-manipulation + ends-tucking for length retention; scalp-first for growth). Never name the book, chapters, or pages.
   - HEADER↔BODY ALIGNMENT (STRICT): the \`action\` header MUST summarise the SAME core move that \`why\` explains. Draft \`why\` first, then write the header from it.
     • If the body's real recommendation is a deep-conditioning mask under a TT Heat Hat, the header is about that mask/heat step — not the cleanse.
     • If the body says keep the same shampoo/conditioner sequence, the header is about repeating that sequence — not a mask.
     • If the body is about protecting ends / low manipulation, the header names that move.
     • Never name cleanse products in the header when the body centres on a mask/heat step. Never name a mask in the header when the body centres on the cleanse.
     • Before returning: reread. If a reader can't guess the header from the body's central instruction, rewrite the header so they can.
   - For dryness/high porosity/humid weather, recommend moisture-first support (deep conditioning mask, conditioner slip) — never default to protein or product-hopping.
   - If suggesting heat, ONLY write [TT Heat Hat](https://www.teamtexture.co.uk) — never generic "heat hat", "heat cap", plastic caps, shower caps, warm towels, steamers, or the raw website as visible text.
   - ABSOLUTE: NEVER suggest a protein/keratin/bond-repair/"strengthening" treatment on any cadence. ABSOLUTE: NEVER suggest scheduled pre-poo.
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
                      action: { type: "string", description: "Short card header, 2-6 words, Title Case. Not a full sentence." },
                      why: { type: "string", description: "Body of the tip explaining the header. 2-4 short sentences grounded in HTLA teachings + a user-specific signal. May use short labelled sub-paragraphs." },
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
    return json(200, await sanitiseAndLog(result, "wash-day-observation"));
  } catch (e) {
    console.log("[wash-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "wash-day-observation");
  }
});
