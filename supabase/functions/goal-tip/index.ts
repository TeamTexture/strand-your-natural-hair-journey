// Generates a short, personalised tip for a hair goal the user just saved.
//
// Receives the goal (challenge, target, target_date, status) plus the
// caller's buildAiContext() payload (hair, health, blood, history, shelf,
// other goals). Returns { tip: { headline, body, actions[] } } where
// actions are 2-3 concrete next-step strings the user can act on.

import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  KNOWLEDGE_REGISTRY,
  renderTopicBlock,
} from "../_shared/knowledge/index.ts";
import type { TopicId } from "../_shared/knowledge/types.ts";
import { renderPassageBlock } from "../_shared/rag.ts";
import { GROUNDING_INSTRUCTION } from "../_shared/grounding.ts";
import {
  METHOD_AND_TIMING_RULE,
  retrieveProceduralPassages,
} from "../_shared/procedural-rag.ts";
import {
  methodRetryDirective,
  validateTipSubstance,
} from "../_shared/tip-method.ts";
import { logTipRejection } from "../_shared/tip-action.ts";
import { buildStylePlaybookBlock } from "../_shared/style-playbook.ts";
import { CORE_ROUTINE_GUARDRAILS_PROMPT } from "../_shared/routine-guidance.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";
import { allChallenges, challengeText, challengesOf } from "../_shared/challenges.ts";
import {
  fetchAdviceLedger,
  buildAdviceLedgerBlock,
  recordAdvice,
  userIdFromRequest,
} from "../_shared/advice-ledger.ts";

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
  const goalText = [challengeText(body.goal), body.goal.target_text]
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
  const goalText = [challengeText(body.goal), body.goal.target_text].filter(Boolean).join(" ");
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

/**
 * DAILY PILLAR ROTATION — Home's single-tip card.
 *
 * Each goal owns a small set of manuscript pillars. The Home card shows ONE
 * tip a day, and the pillar it draws from rotates day to day so the user never
 * sees yesterday's tip again while never leaving the goal's territory. The
 * rotation index is derived from the calling day + goal text + profile
 * fingerprint, so it is stable for the whole day and moves on tomorrow.
 */
const GOAL_PILLARS: Array<{ re: RegExp; pillars: string[] }> = [
  {
    re: /length|grow|retention|retain|longer/i,
    pillars: [
      "keeping the ends tucked away and off clothing/shoulders",
      "moisture and deep conditioning with heat (TT Heat Hat)",
      "low manipulation — fewer hands in the hair between wash days",
      "protective styles chosen and worn without tension",
      "regular trims to stop splits travelling up the strand",
    ],
  },
  {
    re: /break|snap|split|damage/i,
    pillars: [
      "moisture before strength — hydration first",
      "detangling technique and section discipline",
      "protein/strength only when the hair's behaviour asks for it",
      "reducing tension in styling and at the hairline",
      "trimming away compromised ends",
    ],
  },
  {
    re: /moisture|hydrat|dry|dryness|porosity/i,
    pillars: [
      "deep conditioning with heat (TT Heat Hat)",
      "layering and sealing after cleansing",
      "wash frequency matched to her porosity",
      "night-time moisture protection",
      "product choice for her porosity",
    ],
  },
  {
    re: /scalp|itch|flake|dandruff|seborr|folliculitis/i,
    pillars: [
      "cleansing the scalp properly on wash day",
      "spotting the difference between dryness and build-up",
      "scalp-friendly product choices",
      "styling that lets the scalp breathe",
      "when to involve a professional",
    ],
  },
  {
    re: /shed|thinning|fall/i,
    pillars: [
      "shedding versus breakage — reading what is actually coming out",
      "internal signals and flagged markers worth tracking",
      "reducing tension where density is thinnest",
      "gentle handling on wash day",
      "when to involve a professional",
    ],
  },
  {
    re: /protective|braid|twist|wig|weave/i,
    pillars: [
      "install tension and how it should feel",
      "caring for the hair underneath while it's away",
      "how long to keep a style in",
      "taking a style down without damage",
      "the rest period between installs",
    ],
  },
  {
    re: /definition|curl|coil|shrink/i,
    pillars: [
      "styling on soaking-wet hair",
      "product application in sections",
      "drying without disturbing the pattern",
      "refreshing between wash days",
      "protecting the pattern overnight",
    ],
  },
];

const DEFAULT_PILLARS = [
  "wash day fundamentals",
  "moisture and deep conditioning with heat (TT Heat Hat)",
  "low manipulation and gentle handling",
  "protective styling without tension",
  "trims and end care",
];

/**
 * Style-aware pillars. The member's CURRENT install and PLANNED next style
 * change what is actually actionable today, so protective-install pillars are
 * merged in front of the goal's own pillars whenever she is in (or heading
 * into) an install. Length retention while in cornrows is a tension/scalp/
 * take-down conversation, not a "style your curls wet" one.
 */
const PROTECTIVE_RE =
  /cornrow|braid|plait|twist|passion|rope|senegal|knotless|box braid|locs?\b|weave|wig|sew.?in|crochet|extension/i;

function stylePillars(current: string, planned: string): string[] {
  const out: string[] = [];
  if (PROTECTIVE_RE.test(current)) {
    out.push(
      `caring for the hair and scalp underneath her current style (${current})`,
      `reading tension in her current style (${current}) before it costs her hairline`,
      `how long to keep her current style in, and taking it down without damage`,
    );
  }
  if (planned && PROTECTIVE_RE.test(planned)) {
    out.push(
      `preparing her hair for her planned next style (${planned}) — condition, strength and rest before install`,
    );
  }
  return out;
}

function pillarsForGoal(goalText: string, current = "", planned = ""): string[] {
  let base = DEFAULT_PILLARS;
  for (const { re, pillars } of GOAL_PILLARS) {
    if (re.test(goalText ?? "")) { base = pillars; break; }
  }
  const style = stylePillars(current, planned);
  // Style pillars lead so an install-relevant angle comes up often, but the
  // goal's own territory is never dropped.
  return [...style, ...base];
}


/** Small stable hash so the rotation seed is deterministic per day+goal+profile. */
function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Days since epoch for the caller's local day string (YYYY-MM-DD).
 * The Strand tip no longer sends a day — it is STATIC until her picture
 * changes — so an absent/invalid day contributes 0 and the pillar choice is
 * fully deterministic from the profile fingerprint.
 */
function dayIndexOf(day: string | null | undefined): number {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 86_400_000);
}

/** Universal cornrow guidance — any cornrow variant, current or planned. */
function cornrowGuidanceBlock(current: string, planned: string): string {
  if (!/cornrow/i.test(`${current} ${planned}`)) return "";
  return `\n\nMANDATORY CORNROW GUIDANCE — she is in (or moving into) cornrows. Whenever the tip touches washing, cleansing, the scalp, moisture or her ends, it MUST follow both points below, in Paige's voice, phrased for her:
1. Clean the scalp exposed between the cornrows with a scalp cleanser or cleansing solution on a cotton pad, or ready-made scalp cleansing pads — working along each exposed parting rather than lathering shampoo over the whole style.
2. Keep the ends tucked under safely, or protected with a thick gel or an emollient-based leave-in or cream — on the ends and length ONLY, never on the scalp or the exposed partings, which stay oil-free and product-free — to slow moisture evaporating from the hair shaft.
Never substitute other cleansing or sealing methods for these two.`;
}

function buildRotationBlock(body: RequestBody, goalText: string): {
  block: string;
  pillar: string;
} {
  const cs = (body.context?.currentStyle ?? null) as Record<string, unknown> | null;
  const current = String(cs?.current_hairstyle ?? "");
  const planned = String(cs?.planned_next_style ?? "");
  const pillars = pillarsForGoal(goalText, current, planned);
  const seed = stableHash(`${goalText}|${current}|${planned}|${body.profileFingerprint ?? ""}`);
  // With no day sent, this resolves to the strongest, most holistic pillar for
  // her picture (style-aware pillars lead) and stays there until her style,
  // goal or hair characteristics change.
  const pillar = body.day
    ? pillars[(dayIndexOf(body.day) + seed) % pillars.length]
    : pillars[0];
  const styleLine = [
    current ? `She is currently in: ${current}.` : "",
    planned ? `Her planned next style is: ${planned}.` : "",
    goalText ? `Her stated goal, in her words: "${goalText}".` : "",
  ].filter(Boolean).join(" ");
  return {
    pillar,
    block: `HER PILLAR (do not ignore):
This goal's territory is made of these pillars:
${pillars.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Build the single tip on this pillar — the strongest, most holistic one for her right now: "${pillar}".
${styleLine ? `HER SITUATION RIGHT NOW: ${styleLine}\n` : ""}- Stay inside the goal's territory. Never wander to an unrelated topic.
- The tip MUST be doable in the style she is in TODAY. If she is in an install, never tell her to do something that assumes loose hair (wet styling, full detangle, length checks) unless the pillar is take-down or preparation.
- The body MUST name at least one of: her current style, her planned next style, or her goal in her own words — alongside a real hair characteristic. Generic advice about heat or deep conditioning with no link to her current style and goal is invalid.
- The RECENT ADVICE ledger below shows what she has already been told. Take a different angle on today's pillar from anything listed there — a different action, a different moment in her routine, or a progression on a habit she already has ("your deep condition habit is set — now seal your ends after each wash").
- Never repeat a headline or action that appears in the ledger.`,
  };
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const baseSystemPrompt = `${STRAND_PERSONA_WITH_RULES}

${CORE_ROUTINE_GUARDRAILS_PROMPT}

TASK
The user just saved a hair goal in STRAND. Write ONE short, personalised tip that uses their real profile data to tell them what to focus on to actually hit this goal by the target date.

CORE TEACHINGS — SINGLE SOURCE OF TRUTH
Every tip you produce MUST be curated from the STRAND CORE TEACHINGS block appended below. You are not allowed to invent advice outside that framework. If the goal is not directly addressed by the teachings, reason from the closest applicable teaching and stay inside its guidance. Never contradict the teachings. Never add generic hair-care lore from outside them (e.g. no weekly protein, no plastic caps, no steamers — always write [TT Heat Hat](https://www.teamtexture.co.uk) for heat).

Core wash-day baseline: if any action touches wash day, cleansing, shampoo, conditioning, products, dryness, scalp, build-up, length retention or breakage, it must be consistent with Chapter 13's default sequence — cleanse scalp first with a cleansing/all-purpose shampoo, cleanse the hair second with a moisturising/conditioning shampoo, then condition. Adapt for protective styles or scalp sensitivity only when the user's data requires it.

Output:
- "headline": max 9 words. Specific to this goal. No emoji.
- "body": 1-2 sentences (max 40 words). Connect the goal to ONE concrete signal from their profile (porosity, density, current style + duration, a blood marker, a low-rated product, a chemical history flag, etc) AND anchor the advice to a specific idea in the RETRIEVED MANUSCRIPT PASSAGES. No medical claims, no growth promises.
- "actions": exactly {{TIP_COUNT}} items. Each item is an OBJECT with:
    * "action": one imperative next step (max 12 words) that fits into their current routine — wash-day adjustments, product choices, professional check-ins.
    * "why": one short sentence (max 22 words) explaining WHY this step works, drawn from the RETRIEVED MANUSCRIPT PASSAGES and tailored to a specific profile signal (their porosity, density, curl pattern, current style + duration, scalp condition, flagged blood marker, or life stage). No jargon without a translation. Never repeat the action; explain the mechanism or the reason it matters for THIS user.
  Every action must be consistent with the passages and doable in the app (wash day, products, journal, appointments).

Rules:
- The actions MUST be the most valuable, high-leverage moves for THIS goal + THIS profile — not generic hair advice. If the goal is length retention, all three tips must come from length-retention teachings (growth phase, moisture retention, high-manipulation styling, wash frequency); do NOT pad with unrelated topics.
- Prefer the RETRIEVED MANUSCRIPT PASSAGES over the CORE TEACHINGS block when the two overlap — the passages are the chapter-scoped source of truth for this goal.
- Every tip educates as well as instructs. If you can't justify an action with a clear "why", drop it and pick a better one from the passages.
- Reference the actual challenge/target text the user wrote.
- If target_date is present, factor in the time horizon (urgent vs long-term).
- Never invent profile data. If a signal isn't in the payload, don't use it.
- Never name the manuscript, chapters, or page numbers in the output.
- No clichés, no hype words, no "journey" / "queen" / "slay".`;

/**
 * Home card contract: EXACTLY ONE tip. Supersedes the 3-tip contract for this
 * surface only — the Style Journal still asks for the multi-tip playbook.
 */
const SINGLE_TIP_TASK = `TASK — STRAND TIP (EXACTLY ONE TIP)
Write the single most valuable, most holistic action she can take towards her stated goal, personalised through her hair type and characteristics. Use blood markers ONLY when a flagged marker genuinely changes what she should do today; otherwise leave them out entirely.

Output EXACTLY these fields and nothing more:
- "headline": the action itself, max 8 words, imperative, no emoji, no colon-prefixed label.
- "body": ONE sentence, max 30 words: the action detail plus WHY it works for HER, naming a real characteristic from her profile (curl pattern, porosity, density, strand diameter, elasticity, scalp, current style + how long she's been in it, or a flagged marker that actually matters here). A line that could be written for any user is invalid — rewrite it.
- "key_fact": OPTIONAL, max 4 words — a single concrete parameter only if one genuinely applies: a frequency ("Every wash day"), a duration ("20 minutes"), or a tool ("TT Heat Hat"). Omit the field entirely when there isn't a real one. Never invent one.

NO lists. NO actions array. NO extra education block. NO second sentence in the body. One idea, once.

Everything else in this prompt still applies: the persona and voice, the core teachings, the wash-day baseline, the retrieved manuscript passages as the source of truth, the relevance gate (never cite a signal the advice does not actually act on), never naming the book/chapters/pages, and never inventing profile data.`;

/**
 * Style Journal contract: EXACTLY ONE OVERVIEW + ONE CAUTION. Supersedes the
 * multi-tip playbook for that surface. Wash-day technique is explicitly out of
 * scope — it lives on the Wash Day surfaces.
 */
const JOURNAL_TASK = `TASK — HOW YOU'LL GET THERE (ONE OVERVIEW + ONE CAUTION)
Write exactly two blocks for the Style Journal goal section.

Output EXACTLY these fields and nothing more:
- "overview": 1–2 sentences, max 40 words. HOW this specific user will achieve her stated goal, reasoned through her own characteristics and current style (e.g. protecting the ends on high-porosity loose natural hair to retain length). Start with a short bold lead-in phrase followed by an em-dash, then the explanation (e.g. "Protect your ends — high porosity loses moisture fastest at the oldest part of the strand.").
- "caution": 1–2 sentences, max 40 words. The SINGLE most important thing that would undermine this goal for HER (e.g. high-tension styling at the edges, skipping trims so splits travel up the strand). Same bold lead-in then em-dash format.
- "signals": 2–3 items, each max 3 words — the profile characteristics this reasoning actually rests on, humanised for display (e.g. "High porosity", "Loose natural", "4 weeks in braids"). Only signals present in the payload.

HARD SCOPE RULES:
- NO wash-day or routine technique. No numbered steps, no "apply leave-in nightly", no "deep condition for 25 minutes", no product application instructions, no tool timings. That content belongs to the Wash Day surfaces and must not appear here.
- NO actions array, NO lists, NO headline, NO extra education block.
- One idea, once: the overview and the caution must be different ideas, and neither may restate anything in the RECENT ADVICE ledger. The advice ledger applies in full to this surface.
- A line that could be written for any user is invalid — rewrite it through her data.

Everything else in this prompt still applies: the persona and voice, the core teachings, the retrieved manuscript passages as the source of truth, the relevance gate, never naming the book/chapters/pages, and never inventing profile data.`;

interface RequestBody {
  goal: {
    /** Source of truth — a member may list many challenges per goal. */
    challenges?: string[] | null;
    /** @deprecated joined fallback for older clients. */
    challenge: string | null;
    target_text: string | null;
    target_date: string | null;
    status: string | null;
  };
  context: Record<string, unknown>;
  /** How many actions to return (3–5). Legacy multi-tip callers only. */
  maxTips?: number;
  /**
   * Home's Strand Tip of the Day card. When true the function returns exactly
   * ONE tip — headline + one supporting line + at most one key fact — and no
   * action list at all.
   */
  single?: boolean;
  /**
   * Style Journal's "How you'll get there". When "journal" the function returns
   * ONLY { overview, caution, signals } — no actions, no wash-day technique.
   */
  variant?: "journal";
  /** Caller's local day (YYYY-MM-DD) — drives the daily pillar rotation. */
  day?: string;
  /** Profile+goal fingerprint — keeps the rotation stable within a day. */
  profileFingerprint?: string;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body: RequestBody = await req.json();
    const journal = body.variant === "journal";
    const single = !journal && (body.single === true || Number(body.maxTips) === 1);
    const tipCount = single
      ? 1
      : Math.min(5, Math.max(3, Math.round(Number(body.maxTips) || 3)));

    const userPayload = JSON.stringify(body);

    const ledgerUserId = userIdFromRequest(req);
    const ledgerBlock = ledgerUserId
      ? buildAdviceLedgerBlock(await fetchAdviceLedger(ledgerUserId))
      : "";

    const teachings = selectGoalTopics(body);

    // Retrieve manuscript passages grounded in the goal text + user signals.
    // Scope retrieval to the chapters most relevant to this goal so the
    // tips are drawn from the right part of the book (e.g. length → growth,
    // moisture retention, high-manipulation styling, wash frequency).
    const goalText = [challengeText(body.goal), body.goal.target_text].filter(Boolean).join(" ");
    const chapterFilter = selectGoalChapters(goalText);
    const ragQuery = buildRagQuery(body);
    // PROCEDURAL BIAS: retrieval is re-ranked toward passages that describe a
    // method — steps, timings, frequencies, treatments — not passages merely
    // *about* the goal's theme. Thematic passages were the root cause of
    // tautological tips ("protecting your hair prevents damage to your hair").
    // Retry once, then fall back to the full corpus. Never block the user:
    // if retrieval still fails we generate anyway and stamp the payload so
    // ungrounded outputs are visible in the logs.
    let ragBlock = "";
    let ragPassageCount = 0;
    let ragProceduralCount = 0;
    let grounded = false;
    const retrieve = async () => await retrieveProceduralPassages(ragQuery, 6, chapterFilter);
    try {
      let result: Awaited<ReturnType<typeof retrieve>>;
      try {
        result = await retrieve();
      } catch {
        result = await retrieve();
      }
      const passages = result.passages;
      ragPassageCount = passages.length;
      ragProceduralCount = result.procedural;
      grounded = passages.length > 0;
      if (passages.length > 0) {
        ragBlock = `\n\nRETRIEVED MANUSCRIPT PASSAGES (these are the chapter-scoped verbatim teachings for this goal — draw all tips from here, tailored to the user's hair characteristics and health signals):\n\n${passages.map(renderPassageBlock).join("\n\n---\n\n")}\n\n${GROUNDING_INSTRUCTION}\n\n${METHOD_AND_TIMING_RULE}`;
      }
    } catch {
      grounded = false;
    }

    } catch {
      grounded = false;
    }
    if (!grounded) {
      console.error(JSON.stringify({
        event: "manuscript_grounding_failed",
        fn: "goal-tip",
        chapter_scoped: chapterFilter.length > 0,
      }));
    }

    const cs = (body.context?.currentStyle ?? null) as Record<string, unknown> | null;
    const styleBlock = cs
      ? buildStylePlaybookBlock({
          current_hairstyle: (cs.current_hairstyle as string | null) ?? null,
          planned_next_style: (cs.planned_next_style as string | null) ?? null,
          days_in_style: typeof cs.days_in_style === "number" ? (cs.days_in_style as number) : null,
        })
      : "";
    const styleSuffix = styleBlock ? `\n\n${styleBlock}` : "";

    // Home's one-tip card: swap the multi-tip task for the single-tip contract
    // and append today's rotating pillar.
    const rotation = single ? buildRotationBlock(body, goalText) : null;
    const cornrowSuffix = cornrowGuidanceBlock(
      String(cs?.current_hairstyle ?? ""),
      String(cs?.planned_next_style ?? ""),
    );
    const singleSuffix = rotation
      ? `\n\n${SINGLE_TIP_TASK}\n\n${rotation.block}`
      : journal
        ? `\n\n${JOURNAL_TASK}`
        : "";


    const withCount = (t: string) => t.replaceAll("{{TIP_COUNT}}", String(tipCount));
    const systemPrompt = teachings.length > 0
      ? `${baseSystemPrompt}\n\nSTRAND CORE TEACHINGS (curate the tip from these — do not go outside them):\n\n${teachings.join("\n\n")}${ragBlock}${styleSuffix}`
      : `${baseSystemPrompt}${ragBlock}${styleSuffix}`;
    const finalSystemPrompt = `${systemPrompt}${singleSuffix}${cornrowSuffix}`;

    const callModel = (extraDirective = "") => fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: `${withCount(finalSystemPrompt)}\n\n${buildTipsLevelBlock(((body.context as Record<string, unknown> | undefined)?.tipsLevel))}${ledgerBlock ? `\n\n${ledgerBlock}` : ""}${extraDirective ? `\n\n${extraDirective}` : ""}` },

            { role: "user", content: userPayload },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_tip",
                description: "Return the personalised goal tip.",
                parameters: journal
                  ? {
                      type: "object",
                      properties: {
                        overview: { type: "string" },
                        caution: { type: "string" },
                        signals: {
                          type: "array",
                          items: { type: "string" },
                          minItems: 2,
                          maxItems: 3,
                        },
                      },
                      required: ["overview", "caution", "signals"],
                      additionalProperties: false,
                    }
                  : single
                  ? {
                      type: "object",
                      properties: {
                        headline: { type: "string" },
                        body: { type: "string" },
                        key_fact: { type: "string" },
                      },
                      required: ["headline", "body"],
                      additionalProperties: false,
                    }

                  : {
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
                      minItems: tipCount,
                      maxItems: tipCount,
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

    const aiResp = await callModel();

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

    type GoalTipShape = {
      headline?: string;
      body?: string;
      key_fact?: string;
      actions?: unknown[];
      overview?: string;
      caution?: string;
      signals?: unknown[];
    };
    const parseResponse = async (resp: Response): Promise<GoalTipShape | null> => {
      const aiJson = await resp.json();
      const args = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        console.error("goal-tip no tool call", JSON.stringify(aiJson).slice(0, 400));
        return null;
      }
      try {
        return JSON.parse(args) as GoalTipShape;
      } catch (e) {
        console.error("goal-tip bad JSON", e);
        return null;
      }
    };

    let tip = await parseResponse(aiResp);
    if (!tip) {
      return new Response(JSON.stringify({ error: "Malformed AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── METHOD + ANTI-TAUTOLOGY FLOOR ────────────────────────────────
    // Every tip must name a method and must not restate its own goal as its
    // justification. One corrective regeneration, then the best available
    // output is served (never a blank card) and the failure is audited.
    const substanceOf = (t: GoalTipShape | null) => {
      const bodyParts = [
        String(t?.body ?? ""),
        String(t?.key_fact ?? ""),
        String(t?.overview ?? ""),
        ...(Array.isArray(t?.actions)
          ? (t?.actions as Array<string | { action?: string; why?: string }>).map((a) =>
              typeof a === "string" ? a : `${a?.action ?? ""} ${a?.why ?? ""}`,
            )
          : []),
      ].filter(Boolean);
      return validateTipSubstance({
        headline: String(t?.headline ?? ""),
        body: bodyParts.join(" "),
      });
    };
    let verdict = substanceOf(tip);
    if (!verdict.ok) {
      await logTipRejection("goal-tip", verdict.reasons, JSON.stringify(tip).slice(0, 4000));
      try {
        const retryResp = await callModel(methodRetryDirective(verdict.reasons));
        if (retryResp.ok) {
          const retried = await parseResponse(retryResp);
          const retryVerdict = substanceOf(retried);
          if (retried && (retryVerdict.ok || !verdict.ok)) {
            // Prefer the retry when it clears the floor; otherwise keep the
            // richer of the two rather than showing nothing.
            if (retryVerdict.ok) {
              tip = retried;
              verdict = retryVerdict;
            }
          }
        }
      } catch (e) {
        console.warn("[goal-tip] method retry failed", e);
      }
    }


    if (journal) {
      // Hard guarantee of the overview + caution shape regardless of drift.
      tip = {
        overview: String(tip.overview ?? "").trim(),
        caution: String(tip.caution ?? "").trim(),
        signals: (Array.isArray(tip.signals) ? tip.signals : [])
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .slice(0, 3),
        actions: [],
      };
    } else if (single) {
      // Hard guarantee of the one-tip shape regardless of model drift.
      const keyFact = typeof tip.key_fact === "string" ? tip.key_fact.trim() : "";
      tip = {
        headline: String(tip.headline ?? "").trim(),
        body: String(tip.body ?? "").trim(),
        ...(keyFact ? { key_fact: keyFact } : {}),
        actions: [],
      };
    }

    if (ledgerUserId) {
      const actionLines = Array.isArray(tip.actions)
        ? (tip.actions as Array<string | { action?: string }>).map((a) =>
            typeof a === "string" ? a : a?.action ?? "",
          )
        : [];
      await recordAdvice(ledgerUserId, "goal-tip", [
        ...(tip.headline ? [tip.headline] : []),
        ...(journal ? [tip.overview ?? "", tip.caution ?? ""] : []),
        ...(single && tip.body ? [tip.body] : []),
        ...actionLines,
      ].filter(Boolean));
    }


    return new Response(
      JSON.stringify({
        tip: {
          ...(await sanitiseAndLog(tip, "goal-tip", { context: body.context ?? body })),
          _manuscript_grounded: grounded,
          _rag_passages: ragPassageCount,
          _rag_procedural: ragProceduralCount,
          _method_floor: verdict.ok,
        },
      }),
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
