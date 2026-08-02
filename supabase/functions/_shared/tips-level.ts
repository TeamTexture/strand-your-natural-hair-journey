// Tips Level — dynamic support scale (1–4) shared by every AI function.
// Mirrors src/lib/tipsLevel.ts on the client.

export type TipsLevel = 1 | 2 | 3 | 4;

export const DEFAULT_TIPS_LEVEL: TipsLevel = 3;

export function coerceTipsLevel(value: unknown): TipsLevel {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  if (value === "essential") return 2;
  if (value === "detailed") return 3;
  return DEFAULT_TIPS_LEVEL;
}

const DIRECTIVE: Record<TipsLevel, string> = {
  1: "Support level 1 (Minimal). Give only the single highest-priority point per section, in one or two sentences. Those sentences must still do the full job of the advice on their own: say what to DO, how often or when to do it, and the threshold or sign to act on. Never output a condensed version that is only a fact, a myth-bust or a negation — a shorter answer must still teach and direct. No preamble, no definitions, no encouragement padding.",
  2: "Support level 2 (Essentials). Give the top two or three priority points per section, short-form wording, minimal explanation. Each point must still be self-sufficient guidance: the action plus its frequency, timing or trigger. Never reduce a point to a bare statement of fact.",
  3: "Support level 3 (Guided). Give most points with a clear explanation of the why behind each one, in plain but assured clinical language.",

  4: "Support level 4 (Hand-holding). Depth at this level means MORE DISCRETE, SMALLER PIECES — more numbered steps, more labelled blocks, more chips — NEVER longer paragraphs. Produce more separate items than you would at level 1-3, and keep every one of them inside the hard word budgets below. Every step is TAUGHT, not just instructed, but the teaching is SPLIT ACROSS SEPARATE SHORT PIECES: one piece for what to do, one for how, one for why it works, one for what it should feel like when it is right, one for the common mistake. Never merge those into one long paragraph. Reading age 9-10: short sentences, plain words, no jargon. One action per line, numbered when it is a sequence. Where a technical term is unavoidable, use the plain-English phrase in the sentence and never a bracketed aside. Give timings in plain minutes and make every timing DYNAMIC to this user hair — scale up for longer, denser, coarser, tightly-coiled or low-porosity hair and down for short, fine or high-porosity hair, and say in a short clause which characteristic drives the number. For any soaking or rinsing step, give a range AND the finish signal that overrides the clock: every curl heavy and dripping to the roots, and they do not move on until it is. Name the common failure briefly — dry patches at the nape, crown or dense middle. Warm, friendly, assumes zero prior knowledge.",
};

/** System block instructing the model how verbose and how beginner-friendly
 *  to be. Non-negotiable education rules (two-step cleanse, trim education for
 *  length goals) ALWAYS appear — the level only changes how they are explained. */
export function buildTipsLevelBlock(value: unknown): string {
  const level = coerceTipsLevel(value);
  return [
    "USER SUPPORT LEVEL",
    "",
    DIRECTIVE[level],
    "",
    "HARD OUTPUT BUDGETS — NON-NEGOTIABLE AT EVERY LEVEL.",
    "- Any single paragraph or block body: MAXIMUM 2 sentences and about 40 words.",
    "- A step body in a step sequence: MAXIMUM 30 words, plus at most one \"why\" line of MAXIMUM 15 words.",
    "- Headlines and card titles: MAXIMUM 8 words. A lead paragraph: MAXIMUM 45 words.",
    "- Level 4 gets MORE blocks and MORE steps than levels 1-3, each still inside these caps.",
    "If you need more room, add another labelled block or another step — never lengthen a paragraph. A paragraph over 40 words is an error. Re-count your longest paragraph before returning; if it breaks the cap, split it into two blocks.",
    "",
    "Order every list you produce by priority — most important first — so that trimming the list never drops the point that matters most.",
    "SHORTER MUST STILL TEACH. At every level, condensing means rewriting, not deleting sentences from a longer answer. Whatever survives must stand alone as usable guidance: the action, the baseline frequency or trigger, and the sign to watch for. A line like \"trimming doesn't make your hair grow faster\" is a fact, not guidance — it may never be the whole tip at any level. Even an advanced user is here to learn, so every tip must move their understanding or their routine forward.",
    "Non-negotiable: the two-step cleanse protocol, and trim/length-retention education when a length or retention goal is present, must ALWAYS be covered whatever the support level. The level changes how much you explain them, never whether they appear.",

  ].join("\n");
}
