// Generates a fully personalised hair-nutrition plan (diet + avoid) using the
// STRAND persona (Paige Lewin) and the user's complete profile + AI context.
// Cached in ai_summaries (kind = "nutrition_plan"). Force-refresh supported.
//
// Phase 2 Step 6: dual-path — Lovable+Gemini (legacy) and Claude Opus (new),
// gated by STRAND_AI_PROVIDER_NUTRITION. Defaults to "lovable".
// Same response shape: { summary, diet[], avoid[] } so the existing
// NutritionPlan.tsx renderer is unchanged.
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

interface RequestBody {
  force?: boolean;
  context?: Record<string, unknown>;
  diet?: string;
  alcohol?: string;
  flaggedMarkers?: string[];
}

interface NutritionCard {
  emoji: string;
  name: string;
  body: string;
  severity?: "high" | "medium" | "low";
}

interface NutritionPlanPayload {
  summary: string;
  diet: NutritionCard[];
  avoid: NutritionCard[];
}

const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

const TASK_PROMPT_LOVABLE = `TASK
Generate a deeply personalised hair-nutrition plan with two parts: foods to eat ("diet") and things to limit ("avoid"). Speak as Paige.

Voice for this task: follow the VOICE PRINCIPLES above. In every card body, lead with the mechanism (why this nutrient or food matters at the cellular / follicular level, in plain English), then bridge with a connective ("which is why", "so", "this means") into THIS user's specific data — heritage, life stage, medication, blood marker, goal. Talk to "you", not "your hair". Translate any clinical term on first use in a card. No "queen" / "you've got this" energy; warmth comes from naming the food they actually cook with.

PERSONALISATION RULES — apply ALL of these together, not in isolation:
1. Heritage: African / Caribbean diets often centre on starches, oily fish, leafy greens, plantain, beans, ground provisions. Reference culturally familiar foods where possible (e.g. callaloo for folate, ackee for protein, sardines, scotch bonnet, jollof base ingredients) — never generic "leafy greens" if you can name one she likely already cooks with.
2. Age: factor in life stage. Perimenopausal/menopausal women (40s+) need more protein, calcium, omega-3 and B-vitamins for hormonal hair changes. Post-natal / breastfeeding women need extra iron, omega-3, choline. Younger women in heavy training or on contraception have different needs.
3. Health profile: medications (e.g. metformin depletes B12; PPIs reduce iron absorption; SSRIs can affect zinc; oral contraceptives lower B6, folate, zinc), conditions (PCOS, thyroid, endometriosis, anaemia history), pregnancy / breastfeeding, smoker, alcohol intake.
4. Lifestyle: stress level, sleep, training load, hard-water area (more reason to support antioxidants).
5. Diet pattern: vegan / vegetarian / pescatarian / omnivore — never recommend animal foods to a vegan; always offer culturally relevant plant alternatives.
6. Blood markers: every flagged low/high marker must be addressed in the diet section with at least one targeted food explanation.
7. Hair goals: e.g. length retention needs steady protein + iron; thinning recovery needs zinc + biotin + omega-3; postpartum shedding needs ferritin + vitamin D rebuild.
8. Avoid list MUST also be personalised — reference THEIR alcohol level, their medications (e.g. "with metformin, avoid X"), their hard-water area (more antioxidants), their actual habits if known.

FORMAT
Return JSON only via the provided tool. Each card has:
- emoji (single emoji, culturally appropriate where possible)
- name (short, specific — name the actual food, not "leafy greens")
- body (2–3 sentences max: the science + WHY this food matters for THIS user, referencing their data explicitly e.g. "given your low ferritin and African heritage" or "with your metformin use")

OUTPUT REQUIREMENTS:
- diet: 6–10 cards covering protein, iron-support, fat-soluble vitamins, omega-3, antioxidants, B-vitamins. Heavily weighted toward addressing flagged deficiencies first.
- avoid: 4–6 cards, each genuinely personalised. Don't just list "sugar" — say WHY it matters for HER (e.g. inflammation worsens androgenic thinning if PCOS).
- summary: one short paragraph (3–4 sentences) explaining the overall logic of the plan in Paige's voice, referencing the user's specific situation.

CRITICAL: Never produce generic text. If a card could apply to anyone, rewrite it to reference at least one specific data point about THIS user.`;

const RETURN_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "diet", "avoid"],
  properties: {
    summary: {
      type: "string",
      description:
        "3-4 sentence overview of the plan's logic in Paige's voice, grounded in this user's specific data.",
    },
    diet: {
      type: "array",
      minItems: 6,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "name", "body"],
        properties: {
          emoji: { type: "string" },
          name: { type: "string", description: "Specific food name (e.g. 'Mackerel', not 'oily fish')." },
          body: {
            type: "string",
            description:
              "2-3 sentences. Lead with the mechanism in plain English, then connect ('which is why', 'so', 'this means') to THIS user's data: heritage, life stage, blood marker, goal, medication.",
          },
        },
      },
    },
    avoid: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "name", "body"],
        properties: {
          emoji: { type: "string" },
          name: { type: "string" },
          body: {
            type: "string",
            description:
              "2-3 sentences. Mechanism first, then why it matters for THIS user specifically (medication, condition, alcohol level, hard water).",
          },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
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
  return `You're writing a deeply personalised hair-nutrition plan for THIS user. Two parts: "diet" (6-10 foods to eat) and "avoid" (4-6 things to limit), plus a short "summary". Return JSON only via the return_nutrition_plan tool.

Voice for this task: follow the VOICE PRINCIPLES from the system block. Every card body should read like a clinician thinking out loud — start with the MECHANISM in plain English ("Iron stored as ferritin is what your follicles draw on for new growth"), then bridge with a connective ("which is why", "so", "this means") into ONE specific thing you know about this user (a flagged blood marker, a medication they take, their life stage, a stated goal, their heritage, their alcohol intake, their hard-water postcode). "You", never "your hair". Translate any clinical term the FIRST time it appears in any field — "ferritin (your iron stores)", "biotin (a B-vitamin)", etc.

OUTPUT RULES

1. EXPLANATION-FIRST. Never lead a card with "Eat this" or "Avoid that." Lead with the mechanism, then connect to the user, then the food/limit lands as the obvious conclusion.

2. Ground every card in the user's actual data: heritage, life_stage, medications, conditions, blood markers, goals, diet pattern, alcohol intake, hard-water area, recent wash signals if relevant. Never invent data — if a field is missing, don't reference it. If a card could apply to anyone, rewrite it.

3. CULTURAL CONTEXT. If the user is UK-based (location.country, postcode) or African / Caribbean by heritage, prefer foods they likely already cook with — jollof base ingredients, scotch bonnet, plantain, callaloo, ackee, oxtail, mackerel, sardines, eddoes, ground provisions. Don't say "leafy greens" if you can say "callaloo" or "spring greens." For UK users default to UK supermarket / produce names.

4. DIET PATTERN HARD RULE. Never recommend animal foods to a vegan. Never recommend pork or shellfish if the diet field excludes them. Always offer the culturally familiar plant alternative when needed.

5. BLOOD MARKERS. Every flagged low/high marker in flaggedMarkers / bloodResults MUST be addressed by at least one diet card with a targeted food + mechanism. Iron, vitamin D, B12, ferritin, zinc, omega-3, biotin, protein adequacy are the relevant levers.

6. CURRENT GOALS / STYLE. Reference current style or goals only when the mechanism connects (e.g. "a protective style coming up means your follicles are doing the heavy lifting under the wig — protein adequacy matters more this month, which is why…"). Don't reach back to past goals.

7. AVOID LIST. Each avoid card must be personalised — name the medication, marker, or habit it ties to. If a "consistently flagged" ingredient or pattern appeared in their history, you may reference it as "consistently flagged in your history" — never "avoid list" or "your avoids."

8. SCOPE. Hair-health guidance only. Never medical advice, never diagnose. Iron, vitamin D, B12, omega-3, zinc, biotin, protein adequacy are fair game for hair. Anything beyond that — refer back to a clinician.

9. MOISTURE NUANCE. Moisture for hair comes from water against the cuticle, not food. But hydration-from-food (water content in fruit/veg/soup) is still a real lever for whole-body hydration — don't conflate the two. If you mention hydration, frame it as whole-body, not "hydrating the hair."

10. SUMMARY. One short paragraph (3-4 sentences) explaining the plan's overall logic in Paige's voice, naming the 1-2 user signals it's anchored to. No greeting, no sign-off.

11. NO chapter citations. NO "Read more — How To Love Your Afro" links.

12. Plain English, no jargon. Treat the user as a capable adult who knows their body.`;
}

async function runClaude(args: {
  body: RequestBody;
  recentWashSignals: unknown[];
}): Promise<NutritionPlanPayload> {
  const userText = `User-supplied profile:
${JSON.stringify({
  diet: args.body.diet ?? "unknown",
  alcohol: args.body.alcohol ?? "unknown",
  flaggedMarkers: args.body.flaggedMarkers ?? [],
}, null, 2)}

Full user context (currentStyle, goals, challenges, hairProfile, healthProfile, bloodResults, location, professional, history.flagged_ingredients):
${JSON.stringify(args.body.context ?? {}, null, 2)}

Recent wash days where the user reported scalp/hair feel issues (pattern context — low ferritin often shows as shedding patterns):
${JSON.stringify(args.recentWashSignals, null, 2)}

Return JSON only via the return_nutrition_plan tool.`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const req = await buildClaudeRequest({
    function_kind: "nutrition-plan",
    task_instructions: buildClaudeTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.body.context ?? null,
    selector_context: buildSelectorContext(args.body.context ?? {}),
    force_topic_ids: [
      "iron-and-shedding",
      "vits-and-minerals",
      "hormones-and-life-stage",
      "thyroid",
      "diagnosed-conditions",
    ],
    tool: {
      name: "return_nutrition_plan",
      description: "Return the personalised nutrition plan. Always invoke exactly once.",
      input_schema: RETURN_PLAN_SCHEMA as unknown as Record<string, unknown>,
    },
    toolChoice: { type: "tool", name: "return_nutrition_plan" },
    // Opus needs headroom for the full tool_use payload (6-10 diet + 4-6
    // avoid cards, each 2-3 sentences, plus summary). 4096 was truncating
    // mid-tool_use and Anthropic returned an empty/partial input object —
    // which we then silently cached as { diet: [], avoid: [], summary: "" },
    // so every subsequent page load served the empty state without ever
    // re-invoking the function. 8192 leaves comfortable headroom.
    max_tokens: 8192,
  });

  console.log("[nutrition-debug] before model call");
  const result = await callClaude<NutritionPlanPayload>(req);
  console.log(
    JSON.stringify({
      function: "nutrition-plan",
      provider: "claude",
      stop_reason: result.stop_reason,
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
    }),
  );
  console.log("[nutrition-debug] model call done");

  if (!result.toolInput) {
    throw new Error("Claude returned no return_nutrition_plan tool_use block");
  }
  const p = result.toolInput;
  // Diagnostic: dump shape & key list so we can tell if Claude returned an
  // empty {} vs a fully-populated object that we then misread.
  try {
    const raw = JSON.stringify(p);
    console.log(
      "[nutrition-debug] toolInput shape:",
      JSON.stringify({
        type: typeof p,
        keys: p && typeof p === "object" ? Object.keys(p) : [],
        raw_len: raw.length,
        raw_head: raw.slice(0, 400),
      }),
    );
  } catch (e) {
    console.log("[nutrition-debug] toolInput stringify failed", String(e));
  }
  const payload = {
    summary: typeof p.summary === "string" ? p.summary : "",
    diet: Array.isArray(p.diet) ? p.diet : [],
    avoid: Array.isArray(p.avoid) ? p.avoid : [],
  };
  // Hard guard: never return (and therefore never cache) an empty plan.
  if (payload.diet.length === 0 || payload.avoid.length === 0 || !payload.summary) {
    throw new Error(
      `Claude returned incomplete plan (stop_reason=${result.stop_reason}, diet=${payload.diet.length}, avoid=${payload.avoid.length}, summary_len=${payload.summary.length})`,
    );
  }
  return payload;
}

// ─── Provider: Lovable+Gemini (legacy) ────────────────────────────────
async function runLovable(body: RequestBody): Promise<NutritionPlanPayload> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const userPayload = {
    diet: body.diet ?? "unknown",
    alcohol: body.alcohol ?? "unknown",
    flaggedMarkers: body.flaggedMarkers ?? [],
    context: body.context ?? null,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);
  let aiResp: Response;
  try {
    aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `${STRAND_PERSONA}\n\n${VOICE_PRINCIPLES}\n\n${CHAPTER_WHITELIST_PROMPT}\n\n${TASK_PROMPT_LOVABLE}` },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_nutrition_plan",
                description: "Return the personalised hair nutrition plan.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    diet: {
                      type: "array",
                      minItems: 6,
                      maxItems: 10,
                      items: {
                        type: "object",
                        properties: {
                          emoji: { type: "string" },
                          name: { type: "string" },
                          body: { type: "string" },
                        },
                        required: ["emoji", "name", "body"],
                      },
                    },
                    avoid: {
                      type: "array",
                      minItems: 4,
                      maxItems: 6,
                      items: {
                        type: "object",
                        properties: {
                          emoji: { type: "string" },
                          name: { type: "string" },
                          body: { type: "string" },
                          severity: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                          },
                        },
                        required: ["emoji", "name", "body"],
                      },
                    },
                  },
                  required: ["summary", "diet", "avoid"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_nutrition_plan" },
          },
        }),
      },
    );
  } catch (err) {
    clearTimeout(timeoutId);
    const e: Error & { status?: number } = err instanceof Error ? err : new Error(String(err));
    e.status = 504;
    throw e;
  }
  clearTimeout(timeoutId);

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
  const parsed = JSON.parse(toolCall.function.arguments) as Partial<NutritionPlanPayload>;
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    diet: Array.isArray(parsed.diet) ? parsed.diet : [],
    avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const t0 = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing auth" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: "Unauthorized" });

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { force, context, diet, alcohol, flaggedMarkers } = body;

    const provider = readAiProvider("STRAND_AI_PROVIDER_NUTRITION");
    console.log("[nutrition-debug] start", {
      user_id: user.id,
      provider,
      hasBloodResults: Array.isArray((context as { bloodResults?: unknown[] } | undefined)?.bloodResults)
        && ((context as { bloodResults?: unknown[] }).bloodResults?.length ?? 0) > 0,
      currentStyle: (context as { currentStyle?: unknown } | undefined)?.currentStyle ?? null,
    });

    // Build a signature from the inputs that should invalidate cache.
    // Provider is included so flipping the flag forces a regen.
    const sigSource = JSON.stringify({
      provider,
      diet: diet ?? null,
      alcohol: alcohol ?? null,
      flaggedMarkers: (flaggedMarkers ?? []).slice().sort(),
      blood: ((context as { bloodResults?: unknown[] })?.bloodResults ?? []),
      hair: (context as { hairProfile?: unknown })?.hairProfile ?? null,
      health: (context as { healthProfile?: unknown })?.healthProfile ?? null,
      goals: (context as { goals?: unknown })?.goals ?? null,
    });
    let sig = "";
    try {
      const buf = new TextEncoder().encode(sigSource);
      const hash = await crypto.subtle.digest("SHA-256", buf);
      sig = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
    } catch {
      sig = String(sigSource.length);
    }

    if (!force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .eq("kind", "nutrition_plan")
        .maybeSingle();
      const existingSig = (existing?.payload as { _sig?: string } | undefined)?._sig;
      if (existing?.payload && existingSig === sig) {
        console.log("[nutrition-debug] cache hit", { total_ms: Date.now() - t0 });
        return json(200, {
          cached: true,
          plan: sanitiseChapterCitationsDeep(existing.payload),
        });
      }
    }

    let payload: NutritionPlanPayload;
    let providerStamp: "claude" | "lovable";
    if (provider === "claude") {
      // Pull last 5 wash days where the user reported a hair-feel signal.
      const { data: recentRaw } = await supabase
        .from("wash_days")
        .select("wash_date, scalp_feel, breakage, hair_feel_note")
        .eq("user_id", user.id)
        .order("wash_date", { ascending: false })
        .limit(15);
      const recentSignals = (recentRaw ?? [])
        .filter((r) => {
          const note = (r as { hair_feel_note?: string | null }).hair_feel_note;
          const sf = (r as { scalp_feel?: string | null }).scalp_feel;
          const br = (r as { breakage?: string | null }).breakage;
          return (note && note.trim().length > 0) || sf || br;
        })
        .slice(0, 5);

      payload = await runClaude({ body, recentWashSignals: recentSignals });
      providerStamp = "claude";
    } else {
      payload = await runLovable(body);
      providerStamp = "lovable";
    }

    // Defence in depth: never write an empty plan to the cache. runClaude
    // already throws on empty/truncated tool_use, but the legacy Lovable
    // path could conceivably return an empty payload too; if either does,
    // surface as a 500 instead of poisoning the cache and freezing the
    // page on the empty state.
    if (payload.diet.length === 0 || payload.avoid.length === 0 || !payload.summary) {
      throw new Error(
        `Refusing to cache empty nutrition plan (provider=${providerStamp}, diet=${payload.diet.length}, avoid=${payload.avoid.length})`,
      );
    }

    const stamped = {
      ...payload,
      _sig: sig,
      _generated_at: new Date().toISOString(),
      _provider: providerStamp,
      ...(providerStamp === "claude" ? { _model_version: MODEL_VERSION } : {}),
    } as Record<string, unknown>;

    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "nutrition_plan")
      .maybeSingle();

    if (prior?.id) {
      await supabase
        .from("ai_summaries")
        .update({ payload: stamped, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await supabase
        .from("ai_summaries")
        .insert({ user_id: user.id, kind: "nutrition_plan", payload: stamped });
    }

    console.log("[nutrition-debug] all done", {
      total_ms: Date.now() - t0,
      provider: providerStamp,
    });
    return json(200, {
      cached: false,
      plan: sanitiseChapterCitationsDeep(stamped),
    });
  } catch (e) {
    console.log("[nutrition-debug] failed", { total_ms: Date.now() - t0 });
    return aiErrorResponse(e, "nutrition-plan");
  }
});
