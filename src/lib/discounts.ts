// Partner discounts available to STRAND members.
// Codes are placeholders until finalised with partners.

export const HELLO_KLEAN_URL = "https://helloklean.com";
export const HELLO_KLEAN_CODE = "HELLOKLEAN10";

export const DAYE_URL = "https://yourdaye.com";
export const DAYE_CODE = "STRANDDAYE10";

export const LOLA_HEALTH_URL = "https://lolahealth.co";
export const LOLA_HEALTH_CODE = "STRANDLOLA10";

// ── Hello Klean prompt state (per-user, localStorage) ──────────────

const promptPendingKey = (uid: string | undefined) =>
  `helloklean_prompt_pending:${uid ?? "anon"}`;
const unlockedKey = (uid: string | undefined) =>
  `helloklean_unlocked:${uid ?? "anon"}`;

export function queueHelloKleanPrompt(userId: string | undefined) {
  try {
    if (isHelloKleanUnlocked(userId)) return;
    localStorage.setItem(promptPendingKey(userId), "1");
  } catch {}
}

export function consumeHelloKleanPrompt(userId: string | undefined): boolean {
  try {
    const pending = localStorage.getItem(promptPendingKey(userId)) === "1";
    if (pending) localStorage.removeItem(promptPendingKey(userId));
    return pending;
  } catch {
    return false;
  }
}

export function markHelloKleanUnlocked(userId: string | undefined) {
  try {
    localStorage.setItem(unlockedKey(userId), "1");
    localStorage.removeItem(promptPendingKey(userId));
  } catch {}
}

export function isHelloKleanUnlocked(userId: string | undefined): boolean {
  try {
    return localStorage.getItem(unlockedKey(userId)) === "1";
  } catch {
    return false;
  }
}
