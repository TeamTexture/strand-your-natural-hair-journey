// goalChallenges — single accessor for a member's challenges.
//
// `user_goals.challenges` (text[]) is the source of truth. `user_goals.challenge`
// (text) is deprecated and kept only for rollback; it is read here purely as a
// fallback so a client holding a pre-migration cached row still shows something.
// Nothing else in the app should touch the singular column.

export interface ChallengeBearingGoal {
  challenges?: string[] | null;
  challenge?: string | null;
}

/** Every challenge on one goal, trimmed and de-blanked. Empty array is valid. */
export const challengesOf = (goal: ChallengeBearingGoal | null | undefined): string[] => {
  const list = Array.isArray(goal?.challenges) ? goal!.challenges! : [];
  const cleaned = list.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  const legacy = (goal?.challenge ?? "").trim();
  return legacy ? [legacy] : [];
};

/** Flattened, de-duplicated challenges across a set of goals — for AI context. */
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

/** One-line rendering of a goal's challenges, for cards and PDFs. */
export const challengeSummary = (goal: ChallengeBearingGoal | null | undefined): string =>
  challengesOf(goal).join(" · ");

/**
 * Split a spoken transcript into candidate challenges. This is a proposal only
 * — the member confirms or edits the chips before anything is saved, because
 * segmenting speech is guesswork and a bad split would corrupt data the AI
 * then reasons from.
 */
export const proposeChallengesFromTranscript = (transcript: string): string[] => {
  const text = (transcript ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const parts = text
    // Sentence ends, list separators, and the spoken connectives people
    // actually use when listing things out loud.
    .split(/(?:[.;!?\n]+|,\s*(?:and\s+)?|\s+and also\s+|\s+plus\s+|\s+as well as\s+)/i)
    .map((p) =>
      p
        // Trim FIRST — the split leaves leading whitespace, which would stop
        // the filler-word anchor below from ever matching.
        .trim()
        .replace(/^(?:and|also|then|um+|erm+|so|well)\b[\s,]*/i, "")
        .replace(/[\s,]+$/, "")
        .trim(),
    )
    .filter((p) => p.length > 2);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const entry = p.charAt(0).toUpperCase() + p.slice(1);
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.slice(0, 80));
  }
  return out;
};
