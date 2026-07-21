// Compute when a brand offer stops running.
// A placement covers a full London-local calendar day, so the offer "expires"
// at the start of the day AFTER the last placement_date, in Europe/London TZ.

export interface WithPlacements {
  brand_offer_placements?: Array<{ placement_date: string }> | null;
  status?: string | null;
}

/** Returns the ISO date string YYYY-MM-DD of the last active placement, or null. */
export const lastPlacementDate = (offer: WithPlacements): string | null => {
  const dates = (offer.brand_offer_placements ?? [])
    .map((p) => p.placement_date)
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
};

/**
 * Returns the JS Date at which the offer stops being live — the instant the
 * London day after the last placement date begins (i.e. 00:00 next-day London).
 * That's the same boundary strand_today_london() flips on.
 */
export const getOfferExpiry = (offer: WithPlacements): Date | null => {
  const last = lastPlacementDate(offer);
  if (!last) return null;
  // Add one London day. Using the UTC representation is fine — we compare
  // against the current instant, not a London-local wall clock.
  const [y, m, d] = last.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Midnight London on `last` — we want END of that day, so +1 day.
  // Approximate London offset: use Intl to figure out.
  const startOfNextDayUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  // Get the current London offset for that date and subtract it so we anchor
  // to 00:00 Europe/London on (last + 1 day).
  const offsetMinutes = londonOffsetMinutes(startOfNextDayUtc);
  return new Date(startOfNextDayUtc.getTime() - offsetMinutes * 60_000);
};

/** Minutes offset for Europe/London at the given UTC instant (positive = ahead of UTC). */
const londonOffsetMinutes = (utc: Date): number => {
  // Format the UTC instant as London wall-clock parts, rebuild as UTC, diff.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(utc).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - utc.getTime()) / 60_000);
};

export interface Countdown {
  ms: number;
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True when the offer will expire in ≤ 3 hours (and hasn't expired). */
  soon: boolean;
}

export const buildCountdown = (target: Date | null, now: Date = new Date()): Countdown | null => {
  if (!target) return null;
  const ms = target.getTime() - now.getTime();
  const abs = Math.max(ms, 0);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  return {
    ms,
    expired: ms <= 0,
    days, hours, minutes, seconds,
    soon: ms > 0 && ms <= 3 * 3_600_000,
  };
};

/** Compact label: "2d 4h left", "3h 12m left", "8m 14s left", "Expired". */
export const formatCountdown = (c: Countdown | null): string => {
  if (!c) return "";
  if (c.expired) return "Expired";
  if (c.days > 0) return `${c.days}d ${c.hours}h left`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m left`;
  if (c.minutes > 0) return `${c.minutes}m ${c.seconds}s left`;
  return `${c.seconds}s left`;
};
