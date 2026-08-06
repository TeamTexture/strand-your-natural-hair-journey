/**
 * Post-wash-day style profile prompt — handoff between the wash day log and
 * the wash day page. WashStep4 records what was just logged; the wash day page
 * reads it, offers the optional prompt, and clears it once answered.
 *
 * Nothing here writes to user_style_profile. The prompt itself does that, and
 * only when the member saves.
 */

const PENDING_KEY = "strand.stylePrompt.pending";
const DISMISSED_KEY = "strand.stylePrompt.dismissed";

export interface PendingStylePrompt {
  /** wash_days.id of the log that triggered the prompt. */
  washDayId: string;
  /** wash_days.style_after — becomes the prefill for current style. */
  styleAfter: string | null;
  styleExtensions: boolean | null;
  styleTension: string | null;
}

const readDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.slice(-50) : [];
  } catch {
    return [];
  }
};

export const isStylePromptDismissed = (washDayId: string): boolean =>
  readDismissed().includes(washDayId);

export const dismissStylePrompt = (washDayId: string): void => {
  try {
    const next = Array.from(new Set([...readDismissed(), washDayId])).slice(-50);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* dismissal is a nicety — never block the UI on storage */
  }
  clearPendingStylePrompt();
};

export const setPendingStylePrompt = (pending: PendingStylePrompt): void => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
};

export const readPendingStylePrompt = (): PendingStylePrompt | null => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStylePrompt;
    if (!parsed?.washDayId) return null;
    if (isStylePromptDismissed(parsed.washDayId)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearPendingStylePrompt = (): void => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
};
