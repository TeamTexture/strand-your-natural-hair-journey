// challenges — shared accessor for what a member is struggling with.
//
// `user_goals.challenges` (text[]) is the source of truth. `user_goals.challenge`
// (text) is deprecated, kept for rollback only, and read here purely as a
// fallback. Challenges are distinct from `user_hair_profile.areas_of_concern`,
// which records physical locations on the head — never merge the two.

export interface ChallengeBearingGoal {
  challenges?: string[] | null;
  challenge?: string | null;
}

/** Every challenge on one goal. An empty array is a valid state. */
export const challengesOf = (goal: ChallengeBearingGoal | null | undefined): string[] => {
  const list = Array.isArray(goal?.challenges) ? goal!.challenges! : [];
  const cleaned = list.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  const legacy = String(goal?.challenge ?? "").trim();
  return legacy ? [legacy] : [];
};

/** Flattened, de-duplicated challenges across a set of goals. */
export const allChallenges = (
  goals: ReadonlyArray<ChallengeBearingGoal> | null | undefined,
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of goals ?? []) {
    for (const c of challengesOf(g)) {
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
};

/** One-line rendering, for prompt text that wants a single string. */
export const challengeText = (goal: ChallengeBearingGoal | null | undefined): string =>
  challengesOf(goal).join("; ");
