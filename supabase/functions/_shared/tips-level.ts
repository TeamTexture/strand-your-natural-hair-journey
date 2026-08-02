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

  4: "Support level 4 (Hand-holding — \"dummies guide\" mode). This level must contain MORE detail than level 3, never less: include every step, tip and explanation in full, all visible at once, with nothing hidden or deferred. EVERY step must be TAUGHT, not just instructed. For each step give, in this order: (a) what to do, (b) exactly HOW to do it with hands, water temperature, sections and timing, (c) WHY it works — the mechanism inside the hair, drawn from the retrieved manuscript passages, (d) the benefit the user gets from doing it, (e) what it should look or feel like when done right, and (f) the common mistake to avoid. A bare instruction with no mechanism and no benefit is a FAILURE at this level. Worked example of the required depth: 'Rinse with cool water at the end. Turn the tap to cool — not icy — and let the water run down the hair from root to tip for about a minute. Cool water helps the outer scales of each strand (the cuticle) lie back down flat after the warmth of your heat treatment. While the water runs, gently smooth your hair downwards with the flat of your fingers, root to tip, section by section — that stroking motion helps those scales flatten in the right direction. Flat scales trap the water and conditioner you just drove into the strand, so your hair stays soft and hydrated for days instead of drying out by tomorrow. Your hair should feel slippery and look shinier, and it should not squeak. Don't rub or scrunch upwards — that lifts the scales back up and undoes the work.' Write for someone who has NEVER done their own hair and finds text-heavy guidance intimidating. Reading age 9-10: short sentences, plain words, no jargon at all. One action per line, numbered when it is a sequence. Where a technical term is unavoidable, give the plain-English phrase first with the term in brackets, e.g. 'how easily your hair drinks up water (this is called porosity)'. Give timings in plain minutes. Treat every step as a teaching opportunity: the user should finish reading understanding what is happening to their hair and why it helps. Warm and friendly, assume zero prior knowledge, never assume the reader has done this before.",
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
    "SHORTER MUST STILL TEACH. At every level, condensing means rewriting, not deleting sentences from a longer answer. Whatever survives must stand alone as usable guidance: the action, the baseline frequency or trigger, and the sign to watch for. A line like \"trimming doesn't make your hair grow faster\" is a fact, not guidance — it may never be the whole tip at any level. Even an advanced user is here to learn, so every tip must move their understanding or their routine forward.",
    "Non-negotiable: the two-step cleanse protocol, and trim/length-retention education when a length or retention goal is present, must ALWAYS be covered whatever the support level. The level changes how much you explain them, never whether they appear.",

  ].join("\n");
}
