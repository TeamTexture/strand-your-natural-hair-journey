// Generates a short, personalised tip for a hair goal the user just saved.
//
// Receives the goal (challenge, target, target_date, status) plus the
// caller's buildAiContext() payload (hair, health, blood, history, shelf,
// other goals). Returns { tip: { headline, body, actions[] } } where
// actions are 2-3 concrete next-step strings the user can act on.

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { VOICE_PRINCIPLES } from "../_shared/voice.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  KNOWLEDGE_REGISTRY,
  renderTopicBlock,
} from "../_shared/knowledge/index.ts";
import type { TopicId } from "../_shared/knowledge/types.ts";
import { retrievePassages, renderPassageBlock } from "../_shared/rag.ts";

/**
 * Select up to 4 manuscript topics relevant to this goal + user context.
 * Grounds every Strand tip in How To Love Your Afro's core teachings.
 * We bypass the function_kinds gate (goal-tip is not in that union) and
 * match purely on: (a) keywords in the goal challenge/target text, and
 * (b) the user's clinical signals (porosity, density, scalp, life stage,
 * conditions, flagged blood markers).
 */
const GOAL_KEYWORD_TOPICS: Array<{ re: RegExp; topics: TopicId[] }> = [
  { re: /length|grow|retention|retain/i, topics: ["wash-day-mechanics", "protective-styling", "heat-and-moisture"] },
  { re: /shed|shedding|fall(ing)? out|thinning/i, topics: ["iron-and-shedding", "thyroid", "vits-and-minerals"] },
  { re: /break(age|ing)?|snap|split/i, topics: ["protein-and-strengthening", "hair-architecture", "wash-day-mechanics"] },
  { re: /moisture|moisturis|hydrat|dry|dryness/i, topics: ["porosity", "heat-and-moisture", "wash-day-mechanics"] },
  { re: /scalp|itch|flake|dandruff|seborr/i, topics: ["scalp-conditions", "diagnosed-conditions"] },
  { re: /heat|straighten|blow[- ]?dry|silk press/i, topics: ["heat-and-moisture", "protein-and-strengthening"] },
  { re: /protective|braid|twist|wig|weave/i, topics: ["protective-styling", "wash-day-mechanics"] },
  { re: /colour|color|dye|bleach|highlight/i, topics: ["protein-and-strengthening", "porosity"] },
  { re: /volume|density|thicker|fuller/i, topics: ["hair-architecture", "wash-day-mechanics"] },
  { re: /menopause|perimenopause|pregnan|postpartum|contracept|pill|coil|iud/i, topics: ["hormones-and-life-stage", "thyroid"] },
];

/**
 * Map the goal text to the specific manuscript chapters most relevant to that
 * outcome. Length-retention goals must draw from the growth + moisture retention
 * + high-manipulation styling + wash-frequency chapters; breakage from moisture
 * retention + ingredient reading + DIY; scalp from scalp-layers + trichology;
 * etc. Falls back to the core hair-craft chapters if nothing matches.
 */
function selectGoalChapters(goalText: string): number[] {
  const t = (goalText ?? "").toLowerCase();
  const picks = new Set<number>();
  if (/length|grow|retention|retain|longer/.test(t)) {
    // HOW YOUR HAIR GROWS, MOISTURE RETENTION, HIGH-MANIPULATION STYLING,
    // HOW OFTEN TO WASH YOUR HAIR — the length-retention canon.
    [16, 14, 11, 13].forEach((c) => picks.add(c));
  }
  if (/break|snap|split|damage/.test(t)) {
    [14, 15, 17, 11].forEach((c) => picks.add(c));
  }
  if (/moisture|hydrat|dry|dryness|porosity/.test(t)) {
    [14, 15, 17].forEach((c) => picks.add(c));
  }
  if (/scalp|itch|flake|dandruff|seborr|folliculitis/.test(t)) {
    [12, 9, 10].forEach((c) => picks.add(c));
  }
  if (/shed|thinning|fall/.test(t)) {
    [16, 9, 10].forEach((c) => picks.add(c));
  }
  if (/heat|straighten|blow[- ]?dry|silk press/.test(t)) {
    [14, 11].forEach((c) => picks.add(c));
  }
  if (/protective|braid|twist|wig|weave/.test(t)) {
    [11, 13].forEach((c) => picks.add(c));
  }
  if (/colour|color|dye|bleach|highlight/.test(t)) {
    [18, 15].forEach((c) => picks.add(c));
  }
  if (/volume|density|thicker|fuller/.test(t)) {
    [16, 11].forEach((c) => picks.add(c));
  }
  // Sensible defaults so the query always has something on-topic.
  if (picks.size === 0) [16, 14, 11, 13].forEach((c) => picks.add(c));
  return Array.from(picks);
}

function selectGoalTopics(body: RequestBody): string[] {
  const picks = new Set<TopicId>();
  const goalText = [body.goal.challenge, body.goal.target_text]
    .filter(Boolean).join(" ");
  for (const { re, topics } of GOAL_KEYWORD_TOPICS) {
    if (re.test(goalText)) topics.forEach((t) => picks.add(t));
    if (picks.size >= 4) break;
  }

  const ctx = body.context as {
    hair?: { porosity?: string[]; scalp?: string[]; diagnosed?: string[] };
    health?: { lifeStage?: string[]; conditions?: string[]; contraception?: string[] };
    bloodResults?: Array<{ marker?: string; status?: string | null }>;
  };
  const flagged = (ctx.bloodResults ?? [])
    .filter((b) => b.status && !["normal", "untested"].includes((b.status ?? "").toLowerCase()))
    .map((b) => (b.marker ?? "").toLowerCase());
  if (picks.size < 4 && flagged.some((m) => m.includes("ferritin") || m.includes("iron"))) picks.add("iron-and-shedding");
  if (picks.size < 4 && flagged.some((m) => m.includes("tsh") || m.includes("t3") || m.includes("t4"))) picks.add("thyroid");
  if (picks.size < 4 && flagged.some((m) => m.includes("vit") || m.includes("zinc") || m.includes("b12") || m.includes("folate"))) picks.add("vits-and-minerals");
  if (picks.size < 4 && (ctx.hair?.porosity?.length ?? 0) > 0) picks.add("porosity");
  if (picks.size < 4 && (ctx.hair?.scalp?.length ?? 0) > 0) picks.add("scalp-conditions");
  if (picks.size < 4 && (ctx.health?.lifeStage?.length ?? 0) > 0) picks.add("hormones-and-life-stage");
  if (picks.size < 4) picks.add("wash-day-mechanics");

  return Array.from(picks).slice(0, 4)
    .map((id) => renderTopicBlock(KNOWLEDGE_REGISTRY[id]));
}

/**
 * Build a specific RAG query from the goal text PLUS the user's hair
 * characteristics so the retrieved manuscript passages are tuned to THIS
 * person, not the generic goal keyword. Length + high porosity + fine density
 * retrieves different passages than length + low porosity + coarse.
 */
function buildRagQuery(body: RequestBody): string {
  const goalText = [body.goal.challenge, body.goal.target_text].filter(Boolean).join(" ");
  const ctx = body.context as {
    hair?: {
      curl_pattern?: string; porosity?: string[]; density?: string[];
      scalp?: string[]; diagnosed?: string[]; chemical_history?: string[];
      current_style?: string;
    };
    health?: { lifeStage?: string[]; conditions?: string[] };
    bloodResults?: Array<{ marker?: string; status?: string | null }>;
  };
  const bits: string[] = [goalText];
  if (ctx.hair?.curl_pattern) bits.push(ctx.hair.curl_pattern);
  if (ctx.hair?.porosity?.length) bits.push(`${ctx.hair.porosity.join(" ")} porosity`);
  if (ctx.hair?.density?.length) bits.push(`${ctx.hair.density.join(" ")} density`);
  if (ctx.hair?.scalp?.length) bits.push(`scalp ${ctx.hair.scalp.join(" ")}`);
  if (ctx.hair?.diagnosed?.length) bits.push(ctx.hair.diagnosed.join(" "));
  if (ctx.hair?.chemical_history?.length) bits.push(ctx.hair.chemical_history.join(" "));
  if (ctx.hair?.current_style) bits.push(`currently wearing ${ctx.hair.current_style}`);
  if (ctx.health?.lifeStage?.length) bits.push(ctx.health.lifeStage.join(" "));
  const flagged = (ctx.bloodResults ?? [])
    .filter((b) => b.status && !["normal", "untested"].includes((b.status ?? "").toLowerCase()))
    .map((b) => `${b.status} ${b.marker}`);
  if (flagged.length) bits.push(flagged.join(" "));
  return bits.filter(Boolean).join(" — ");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const baseSystemPrompt = `${STRAND_PERSONA_WITH_RULES}

${VOICE_PRINCIPLES}

TASK
The user just saved a hair goal in STRAND. Write ONE short, personalised tip that uses their real profile data to tell them what to focus on to actually hit this goal by the target date.

CORE TEACHINGS — SINGLE SOURCE OF TRUTH
Every tip you produce MUST be curated from the STRAND CORE TEACHINGS block appended below (drawn verbatim from the STRAND clinical manuscript, "How To Love Your Afro"). You are not allowed to invent advice outside that framework. If the goal is not directly addressed by the teachings, reason from the closest applicable teaching and stay inside its guidance. Never contradict the teachings. Never add generic hair-care lore from outside them (e.g. no weekly protein, no plastic caps, no steamers — always TT Heat Hat, www.teamtexture.co.uk, for heat).

Output:
- "headline": max 9 words. Specific to this goal. No emoji.
- "body": 1-2 sentences (max 40 words). Connect the goal to ONE concrete signal from their profile (porosity, density, current style + duration, a blood marker, a low-rated product, a chemical history flag, etc) AND anchor the advice to a specific idea in the RETRIEVED MANUSCRIPT PASSAGES. No medical claims, no growth promises.
- "actions": exactly 3 items. Each item is an OBJECT with:
    * "action": one imperative next step (max 12 words) that fits into their current routine — wash-day adjustments, product choices, professional check-ins.
    * "why": one short sentence (max 22 words) explaining WHY this step works, drawn from the RETRIEVED MANUSCRIPT PASSAGES and tailored to a specific profile signal (their porosity, density, curl pattern, current style + duration, scalp condition, flagged blood marker, or life stage). No jargon without a translation. Never repeat the action; explain the mechanism or the reason it matters for THIS user.
  Every action must be consistent with the passages and doable in the app (wash day, products, journal, appointments).

Rules:
- The three actions MUST be the three most valuable, high-leverage moves for THIS goal + THIS profile — not generic hair advice. If the goal is length retention, all three tips must come from length-retention teachings (growth phase, moisture retention, high-manipulation styling, wash frequency); do NOT pad with unrelated topics.
- Prefer the RETRIEVED MANUSCRIPT PASSAGES over the CORE TEACHINGS block when the two overlap — the passages are the chapter-scoped source of truth for this goal.
- Every tip educates as well as instructs. If you can't justify an action with a clear "why", drop it and pick a better one from the passages.
- Reference the actual challenge/target text the user wrote.
- If target_date is present, factor in the time horizon (urgent vs long-term).
- Never invent profile data. If a signal isn't in the payload, don't use it.
- Never name the manuscript, chapters, or page numbers in the output.
- No clichés, no hype words, no "journey" / "queen" / "slay".`;

interface RequestBody {
  goal: {
    challenge: string | null;
    target_text: string | null;
    target_date: string | null;
    status: string | null;
  };
  context: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: RequestBody = await req.json();
    const userPayload = JSON.stringify(body);

    const teachings = selectGoalTopics(body);

    // Retrieve manuscript passages grounded in the goal text + user signals.
    // Scope retrieval to the chapters most relevant to this goal so the
    // tips are drawn from the right part of the book (e.g. length → growth,
    // moisture retention, high-manipulation styling, wash frequency).
    const goalText = [body.goal.challenge, body.goal.target_text].filter(Boolean).join(" ");
    const chapterFilter = selectGoalChapters(goalText);
    const ragQuery = buildRagQuery(body);
    let ragBlock = "";
    try {
      let passages = await retrievePassages(ragQuery, 6, chapterFilter);
      // Fallback: if the chapter-scoped query returned nothing (e.g. missing
      // embeddings for those chapters), fall back to the full corpus.
      if (passages.length === 0) {
        passages = await retrievePassages(ragQuery, 6);
      }
      if (passages.length > 0) {
        ragBlock = `\n\nRETRIEVED MANUSCRIPT PASSAGES (these are the chapter-scoped verbatim teachings for this goal — draw all three tips from here, tailored to the user's hair characteristics and health signals):\n\n${passages.map(renderPassageBlock).join("\n\n---\n\n")}`;
      }
    } catch (e) {
      console.warn("goal-tip RAG retrieval failed (continuing):", e);
    }

    const systemPrompt = teachings.length > 0
      ? `${baseSystemPrompt}\n\nSTRAND CORE TEACHINGS (curate the tip from these — do not go outside them):\n\n${teachings.join("\n\n")}${ragBlock}`
      : `${baseSystemPrompt}${ragBlock}`;

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
            { role: "user", content: userPayload },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_tip",
                description: "Return the personalised goal tip.",
                parameters: {
                  type: "object",
                  properties: {
                    headline: { type: "string" },
                    body: { type: "string" },
                    actions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          action: { type: "string" },
                          why: { type: "string" },
                        },
                        required: ["action", "why"],
                        additionalProperties: false,
                      },
                      minItems: 3,
                      maxItems: 3,
                    },
                  },
                  required: ["headline", "body", "actions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_tip" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("goal-tip AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("goal-tip no tool call", JSON.stringify(aiJson).slice(0, 400));
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let tip: { headline: string; body: string; actions: string[] };
    try {
      tip = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("goal-tip bad JSON", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ tip: await sanitiseAndLog(tip, "goal-tip") }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("goal-tip error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
