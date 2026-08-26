// Per-user VIEW preferences kept in the browser, never in the database.
//
// These are display choices (which shelf categories a member has collapsed),
// not member data — so they live in localStorage. Two rules:
//   1. Keys are namespaced by user id, so on a shared device one member's
//      collapsed categories never show up for another.
//   2. Keys carry the `strand_` prefix, so `purgeStrandUserScopedKeys` clears
//      them on sign-out along with every other app-written key.
//
// Reads/writes are best-effort: private-mode browsers throw on storage access
// and a lost view preference must never break a screen.

const key = (userId: string | null | undefined, name: string) =>
  `strand_viewpref_${userId ?? "anon"}_${name}`;

export function readViewPref<T>(
  userId: string | null | undefined,
  name: string,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key(userId, name));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeViewPref(
  userId: string | null | undefined,
  name: string,
  value: unknown,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(userId, name), JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}
