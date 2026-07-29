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
  1: "Support level 1 (Minimal). Give only the single highest-priority point per section. Concise and direct. No preamble, no definitions, no encouragement padding.",
  2: "Support level 2 (Essentials). Give the top two or three priority points per section, short-form wording, minimal explanation.",
  3: "Support level 3 (Guided). Give most points with a clear explanation of the why behind each one, in plain but assured clinical language.",
  4: "Support level 4 (Hand-holding — \"dummies guide\" mode). This level must contain MORE detail than level 3, never less: include every step, tip and explanation in full, all visible at once, with nothing hidden or deferred. For each step give what to do, how to do it, how long it takes, what it should look or feel like, and what to avoid. Write for someone who has NEVER done their own hair and finds text-heavy guidance intimidating. Reading age 9-10: short sentences, plain words, no jargon at all. One action per line, numbered when it is a sequence (e.g. '1. Wet your hair fully. 2. Put a coin-sized amount of shampoo in your palm.'). Where a technical term is unavoidable, give the plain-English phrase first with the term in brackets, e.g. 'how easily your hair drinks up water (this is called porosity)'. Give timings in plain minutes. Where practice commonly goes wrong, give a clear do and a clear don't. Warm and friendly, assume zero prior knowledge, never assume the reader has done this before.",
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
    "Order every list you produce by priority — most important first — so that trimming the list never drops the point that matters most.",
    "Non-negotiable: the two-step cleanse protocol, and trim/length-retention education when a length or retention goal is present, must ALWAYS be covered whatever the support level. The level changes how much you explain them, never whether they appear.",
  ].join("\n");
}
