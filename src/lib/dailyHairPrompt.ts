// The daily touchpoint card on Home — folds, never disappears.
//
// Collapsing is per member, per day: it stays folded for the rest of that day
// (so it doesn't re-open on every return to Home) and always opens fresh the
// next day. Collapsing means "not now", not "never". Stored under the purged
// `strand_` namespace.

const key = (userId: string) => `strand_daily_hair_prompt_collapsed_${userId}`;

export const isDailyPromptCollapsed = (userId: string | undefined, todayIso: string) => {
  if (!userId) return false;
  try {
    return localStorage.getItem(key(userId)) === todayIso;
  } catch {
    return false;
  }
};

export const setDailyPromptCollapsed = (
  userId: string | undefined,
  todayIso: string,
  collapsed: boolean,
) => {
  if (!userId) return;
  try {
    if (collapsed) localStorage.setItem(key(userId), todayIso);
    else localStorage.removeItem(key(userId));
  } catch {
    /* private mode / quota — the card simply opens again */
  }
};
