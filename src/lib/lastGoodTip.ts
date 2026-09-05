// LAST-GOOD TIP CACHE — stale-while-revalidate for guidance surfaces.
//
// Every tip surface keys its cache on a signature built from the member's hair,
// style and goals. That is correct — guidance must never describe a profile she
// no longer has — but it means a single change (she switches from cornrows to
// passion twists) invalidates every surface at once and leaves her watching
// spinners while each one regenerates.
//
// So each surface also stores its most recent GOOD payload under a key that
// carries no signature. That payload is rendered immediately as placeholder
// data and swapped out the moment the freshly personalised tip lands.

const key = (surface: string, level: number | undefined, extra = "") =>
  `strand:last-good:${surface}:l${level ?? 3}${extra ? `:${extra}` : ""}`;

export function readLastGood<T>(
  surface: string,
  level?: number,
  extra?: string,
  isGood?: (value: T) => boolean,
): T | undefined {
  try {
    const raw = localStorage.getItem(key(surface, level, extra));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as T;
    if (isGood && !isGood(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeLastGood<T>(
  surface: string,
  value: T | null | undefined,
  level?: number,
  extra?: string,
  isGood?: (value: T) => boolean,
) {
  if (value === null || value === undefined) return;
  if (isGood && !isGood(value)) return;
  try {
    localStorage.setItem(key(surface, level, extra), JSON.stringify(value));
  } catch {
    /* private mode / quota */
  }
}

/**
 * Drop every stored last-good payload. Called on a style change: a payload
 * written for the previous style must never be rendered as placeholder data,
 * so the surface shows its honest updating state while it regenerates.
 */
export function clearAllLastGood() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("strand:last-good:")) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    /* private mode / quota */
  }
}
