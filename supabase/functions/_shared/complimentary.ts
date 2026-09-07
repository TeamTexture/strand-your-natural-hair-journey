// Complimentary access — shared helpers.
//
// A gift of free access is a real Stripe trial on a real subscription, tagged
// with `strand_complimentary_until` in the subscription metadata. That tag is
// the ONLY thing that distinguishes a gifted period from the ordinary 3-day
// signup trial, so every surface that needs to tell them apart reads it from
// here rather than guessing from dates.

/** Stripe subscription metadata key holding the gift end date (YYYY-MM-DD). */
export const COMPLIMENTARY_META_KEY = "strand_complimentary_until";

/** Offset of Europe/London from UTC, in milliseconds, at the given instant. */
function londonOffsetMs(ts: number): number {
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(ts))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  return sign * (hours * 60 + mins) * 60_000;
}

/**
 * Unix seconds for 23:59:59 on `date` (YYYY-MM-DD) in Europe/London, so a gift
 * "until the 30th" includes the whole of the 30th as the member experiences it.
 */
export function londonEndOfDayUnix(date: string): number {
  const guess = Date.parse(`${date}T23:59:59Z`);
  if (!isFinite(guess)) throw new Error("invalid date");
  let ts = guess - londonOffsetMs(guess);
  // One correction pass handles the clock-change boundaries.
  ts = guess - londonOffsetMs(ts);
  return Math.floor(ts / 1000);
}

/** ISO timestamp for the same moment, for persisting on the membership row. */
export function londonEndOfDayIso(date: string): string {
  return new Date(londonEndOfDayUnix(date) * 1000).toISOString();
}

export function isValidDateString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    isFinite(Date.parse(`${v}T00:00:00Z`));
}

/**
 * The gift end date carried on a Stripe subscription, as an ISO timestamp, or
 * null when this subscription is not a gifted period.
 */
export function complimentaryUntilIso(
  metadata: Record<string, string> | null | undefined,
): string | null {
  const raw = metadata?.[COMPLIMENTARY_META_KEY];
  if (!isValidDateString(raw)) return null;
  try {
    return londonEndOfDayIso(raw);
  } catch {
    return null;
  }
}
