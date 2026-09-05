// "Have you done anything with your hair today?" — one card a day.
//
// Dismissal is per member, per day: it never nags twice on the same day and it
// always comes back the next day. Stored under the purged `strand_` namespace.

const key = (userId: string) => `strand_daily_hair_prompt_dismissed_${userId}`;

export const isDailyPromptDismissed = (userId: string | undefined, todayIso: string) => {
  if (!userId) return false;
  try {
    return localStorage.getItem(key(userId)) === todayIso;
  } catch {
    return false;
  }
};

export const dismissDailyPrompt = (userId: string | undefined, todayIso: string) => {
  if (!userId) return;
  try {
    localStorage.setItem(key(userId), todayIso);
  } catch {
    /* private mode / quota — the card simply reappears */
  }
};
