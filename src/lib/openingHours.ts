import type { Professional } from "@/data/professionals";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const LABEL: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const dayKey = (d: Date): DayKey => {
  // JS: 0 = Sunday .. 6 = Saturday. Map to our mon-first order.
  const idx = [6, 0, 1, 2, 3, 4, 5][d.getDay()];
  return ORDER[idx];
};

const fmtTime = (hhmm: string): string => {
  const [hRaw, mRaw] = (hhmm ?? "").split(":");
  const h = Number.parseInt(hRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  if (!Number.isFinite(h)) return hhmm ?? "";
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (!Number.isFinite(m) || m === 0) return `${h12}${period}`;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
};

/**
 * Human-readable summary for the current day. Returns null when the pro
 * hasn't published any hours.
 *
 * Examples:
 *   "Open today until 6pm"
 *   "Closed today · opens Tuesday at 9am"
 *   "Closed today"
 */
export function summariseOpeningHours(oh: Professional["openingHours"], now = new Date()): string | null {
  if (!oh) return null;
  const today = oh[dayKey(now)];
  if (today && !today.closed) {
    return `Open today until ${fmtTime(today.close)}`;
  }
  // Find the next open day within a week
  for (let i = 1; i <= 7; i++) {
    const next = new Date(now);
    next.setDate(now.getDate() + i);
    const k = dayKey(next);
    const day = oh[k];
    if (day && !day.closed) {
      return `Closed today · opens ${LABEL[k]} at ${fmtTime(day.open)}`;
    }
  }
  return "Closed today";
}

/** Structured list for expanded view. */
export function listOpeningHours(oh: Professional["openingHours"]): Array<{ label: string; value: string; isToday: boolean }> {
  if (!oh) return [];
  const today = dayKey(new Date());
  return ORDER.map((k) => {
    const day = oh[k];
    const value = !day || day.closed ? "Closed" : `${fmtTime(day.open)} – ${fmtTime(day.close)}`;
    return { label: LABEL[k], value, isToday: k === today };
  });
}
