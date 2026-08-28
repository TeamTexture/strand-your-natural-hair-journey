// ─────────────────────────────────────────────────────────────────────────────
// Plan duration, as the member typed it.
//
// The whole treatment engine (weeks, milestones, check-in cycles, reminder
// RPCs, emails) reads ONE number: duration_weeks. These helpers only convert
// what she chose into that number, and remember her original wording so the UI
// can say "10 days" rather than "2 weeks". Nothing downstream changes.
// ─────────────────────────────────────────────────────────────────────────────

export type DurationUnit = "days" | "weeks" | "months";

export const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
];

/** Sensible ceiling per unit so a typo can't create a 900-week plan. */
export const DURATION_MAX: Record<DurationUnit, number> = {
  days: 365,
  weeks: 104,
  months: 24,
};

/** Average weeks in a month — a 3-month plan is 13 weeks, not 12. */
const WEEKS_PER_MONTH = 4.345;

export function clampDurationValue(value: number, unit: DurationUnit): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(DURATION_MAX[unit], Math.max(1, Math.round(value)));
}

/** The single number the week engine runs on. Always at least 1 week. */
export function durationToWeeks(value: number, unit: DurationUnit): number {
  const v = clampDurationValue(value, unit);
  switch (unit) {
    case "days":
      return Math.max(1, Math.ceil(v / 7));
    case "months":
      return Math.max(1, Math.ceil(v * WEEKS_PER_MONTH));
    default:
      return v;
  }
}

/** "10 days", "1 month", "12 weeks" — for headings and summaries. */
export function durationLabel(value: number | null, unit: DurationUnit | null, fallbackWeeks: number): string {
  if (!value || !unit) {
    return `${fallbackWeeks} week${fallbackWeeks === 1 ? "" : "s"}`;
  }
  const v = clampDurationValue(value, unit);
  const noun = unit === "days" ? "day" : unit === "months" ? "month" : "week";
  return `${v} ${noun}${v === 1 ? "" : "s"}`;
}

/** "10 days — runs as 2 weeks" when the conversion isn't 1:1. */
export function durationHelper(value: number, unit: DurationUnit): string | null {
  if (unit === "weeks") return null;
  const weeks = durationToWeeks(value, unit);
  return `Tracked as ${weeks} week${weeks === 1 ? "" : "s"}`;
}
