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
  4: "Support level 4 (Hand-holding). Assume a total beginner who has never done their own hair. Give everything: explain the why in full, frame each action step by step, define technical terms inline the first time they appear (porosity, surfactant, elasticity, density, clarifying), and include warm encouragement.",
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
