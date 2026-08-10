/**
 * TREATMENT PLAN DATE ENGINE — the single source of truth.
 *
 * Every adherence number, "due today" list, week count and streak line in the
 * app comes from this module. Nothing else in the codebase may recompute
 * expected occurrences from a schedule row: if two surfaces ever disagree on a
 * percentage, that is a bug in here and nowhere else.
 *
 * Conventions
 * - Dates are handled as local calendar days in `yyyy-mm-dd` form, matching the
 *   `date` columns on treatment_plan_entries / treatment_plans.
 * - days_of_week uses JavaScript weekday numbering: 0 = Sunday … 6 = Saturday.
 * - Future days are NEVER counted as expected. A plan can only be measured up
 *   to today.
 * - A skipped entry is not a completed one, but it is never framed as failure.
 */

export type TreatmentCadence = "daily" | "specific_days" | "weekly";
export type TreatmentTimeOfDay = "morning" | "evening" | "both";
/** A single loggable slot. `both` schedules produce two slots per due day. */
export type TreatmentSlot = "morning" | "evening";
export type TreatmentEntryStatus = "completed" | "skipped";

export interface ScheduleRow {
  id: string;
  plan_id: string;
  task_name: string;
  instructions: string | null;
  cadence: TreatmentCadence;
  days_of_week: number[] | null;
  time_of_day: TreatmentTimeOfDay;
  product_id: string | null;
  step_order: number;
}

export interface EntryRow {
  id: string;
  plan_id: string;
  schedule_id: string;
  entry_date: string;
  time_of_day: TreatmentSlot;
  status: TreatmentEntryStatus;
  note: string | null;
  completed_at: string | null;
}

/* ------------------------------------------------------------------ dates */

export const toDateKey = (d: Date): string => {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export const fromDateKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const todayKey = (): string => toDateKey(new Date());

export const addDays = (key: string, n: number): string => {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
};

/** Whole days from `a` to `b` (negative when b is before a). */
export const daysBetween = (a: string, b: string): number =>
  Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86_400_000);

/** Clamp a key to at most `max`. */
const minKey = (a: string, b: string) => (daysBetween(a, b) < 0 ? b : a);

/* -------------------------------------------------------------- weeks */

/** 1-indexed plan week that a date falls in. Week 1 starts on start_date. */
export function weekNumberFor(startDate: string, dateKey: string): number {
  const diff = daysBetween(startDate, dateKey);
  if (diff < 0) return 0;
  return Math.floor(diff / 7) + 1;
}

/** Inclusive date range of a 1-indexed plan week. */
export function weekRange(startDate: string, week: number): { start: string; end: string } {
  const start = addDays(startDate, (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

/* ----------------------------------------------------- slots and dueness */

/** The slots a schedule row expects on a day it is due. */
export function slotsFor(time_of_day: TreatmentTimeOfDay): TreatmentSlot[] {
  return time_of_day === "both" ? ["morning", "evening"] : [time_of_day];
}

/**
 * Is this schedule row due on this calendar day?
 * - daily          → every day
 * - specific_days  → the chosen weekdays
 * - weekly         → the same weekday as the plan start date
 */
export function isDueOn(row: ScheduleRow, startDate: string, dateKey: string): boolean {
  if (daysBetween(startDate, dateKey) < 0) return false;
  const weekday = fromDateKey(dateKey).getDay();
  if (row.cadence === "daily") return true;
  if (row.cadence === "specific_days") return (row.days_of_week ?? []).includes(weekday);
  // weekly
  return weekday === fromDateKey(startDate).getDay();
}

/** Every (schedule, slot) pair due on a given day. */
export function dueSlotsOn(
  rows: ScheduleRow[],
  startDate: string,
  dateKey: string,
): Array<{ row: ScheduleRow; slot: TreatmentSlot }> {
  const out: Array<{ row: ScheduleRow; slot: TreatmentSlot }> = [];
  for (const row of [...rows].sort((a, b) => a.step_order - b.step_order)) {
    if (!isDueOn(row, startDate, dateKey)) continue;
    for (const slot of slotsFor(row.time_of_day)) out.push({ row, slot });
  }
  return out;
}

/**
 * Expected occurrences across a window, inclusive, capped at `today`.
 * Never counts a future day.
 */
export function expectedOccurrences(
  rows: ScheduleRow[],
  startDate: string,
  from: string,
  to: string,
  today: string = todayKey(),
): number {
  const first = daysBetween(startDate, from) < 0 ? startDate : from;
  const last = minKey(to, today);
  if (daysBetween(first, last) < 0) return 0;
  let count = 0;
  for (let key = first; daysBetween(key, last) >= 0; key = addDays(key, 1)) {
    count += dueSlotsOn(rows, startDate, key).length;
  }
  return count;
}

/* ------------------------------------------------------------- adherence */

export interface Adherence {
  /** 0-100, rounded. 0 expected ⇒ 0 with `hasData` false. */
  percent: number;
  completed: number;
  expected: number;
  skipped: number;
  /** Plain-language unit — "evenings", "mornings" or "steps". */
  unit: string;
  hasData: boolean;
  /** e.g. "18 of 21 evenings logged" */
  line: string;
}

/** Plain-language unit for a set of schedule rows. */
export function unitFor(rows: ScheduleRow[]): string {
  const times = new Set(rows.flatMap((r) => slotsFor(r.time_of_day)));
  if (times.size === 1 && times.has("evening")) return "evenings";
  if (times.size === 1 && times.has("morning")) return "mornings";
  return "steps";
}

/**
 * Adherence from the plan start date up to and including today.
 * Pass a window (e.g. a single week) to scope it.
 */
export function computeAdherence(
  rows: ScheduleRow[],
  entries: EntryRow[],
  startDate: string,
  opts?: { from?: string; to?: string; today?: string },
): Adherence {
  const today = opts?.today ?? todayKey();
  const from = opts?.from ?? startDate;
  const to = minKey(opts?.to ?? today, today);
  const expected = expectedOccurrences(rows, startDate, from, to, today);
  const inWindow = entries.filter(
    (e) => daysBetween(from, e.entry_date) >= 0 && daysBetween(e.entry_date, to) >= 0,
  );
  const completed = inWindow.filter((e) => e.status === "completed").length;
  const skipped = inWindow.filter((e) => e.status === "skipped").length;
  const unit = unitFor(rows);
  const percent = expected > 0 ? Math.min(100, Math.round((completed / expected) * 100)) : 0;
  return {
    percent,
    completed,
    expected,
    skipped,
    unit,
    hasData: expected > 0,
    line: expected > 0 ? `${completed} of ${expected} ${unit} logged` : `Starts soon`,
  };
}

/* ------------------------------------------------------------- day counts */

export interface DayCounts {
  /** Calendar days in the window that expected at least one step (capped at today). */
  daysDue: number;
  /** Days where every step due that day was logged as completed. */
  daysLogged: number;
  /** Days where some but not all due steps were logged. */
  daysPartial: number;
}

/**
 * Day-level adherence: how many days she did everything she said she'd do.
 * Used for daily routines, where "5 of 7 days" reads far better than steps.
 */
export function dayCounts(
  rows: ScheduleRow[],
  entries: EntryRow[],
  startDate: string,
  from: string,
  to: string,
  today: string = todayKey(),
): DayCounts {
  const first = daysBetween(startDate, from) < 0 ? startDate : from;
  const last = minKey(to, today);
  let daysDue = 0;
  let daysLogged = 0;
  let daysPartial = 0;
  if (daysBetween(first, last) < 0) return { daysDue, daysLogged, daysPartial };
  for (let key = first; daysBetween(key, last) >= 0; key = addDays(key, 1)) {
    const due = dueSlotsOn(rows, startDate, key);
    if (!due.length) continue;
    daysDue += 1;
    const done = due.filter(({ row, slot }) =>
      entries.some(
        (e) =>
          e.schedule_id === row.id &&
          e.entry_date === key &&
          e.time_of_day === slot &&
          e.status === "completed",
      ),
    ).length;
    if (done === due.length) daysLogged += 1;
    else if (done > 0) daysPartial += 1;
  }
  return { daysDue, daysLogged, daysPartial };
}

/** True when the routine expects something every single day — a daily rhythm. */
export function isDailyPlan(rows: ScheduleRow[]): boolean {
  return rows.some((r) => r.cadence === "daily");
}


/* ---------------------------------------------------------------- weeks */

export interface WeekSummary {
  week: number;
  start: string;
  end: string;
  /** past | current | future */
  state: "past" | "current" | "future";
  completed: number;
  /** Expected in that week, capped at today for the current week. */
  expected: number;
  /** Full expected for the week ignoring the today cap — for future weeks. */
  expectedFull: number;
  isMilestone: boolean;
}

export function weekBreakdown(
  rows: ScheduleRow[],
  entries: EntryRow[],
  startDate: string,
  durationWeeks: number,
  milestoneWeeks: number[] = [],
  today: string = todayKey(),
): WeekSummary[] {
  const currentWeek = weekNumberFor(startDate, today);
  return Array.from({ length: Math.max(1, durationWeeks) }, (_, i) => {
    const week = i + 1;
    const { start, end } = weekRange(startDate, week);
    const state: WeekSummary["state"] =
      currentWeek === 0 || week > currentWeek ? "future" : week === currentWeek ? "current" : "past";
    const scoped = computeAdherence(rows, entries, startDate, { from: start, to: end, today });
    return {
      week,
      start,
      end,
      state,
      completed: scoped.completed,
      expected: scoped.expected,
      expectedFull: expectedOccurrences(rows, startDate, start, end, end),
      isMilestone: milestoneWeeks.includes(week),
    };
  });
}

/* ---------------------------------------------------------------- copy */

/** Eyebrow label for a slot — "This morning" / "Tonight". */
export const slotLabel = (slot: TreatmentSlot) => (slot === "morning" ? "This morning" : "Tonight");

/** Secondary action label — "Skip this morning" / "Skip tonight". */
export const skipLabel = (slot: TreatmentSlot) =>
  slot === "morning" ? "Skip this morning" : "Skip tonight";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Default photo milestone weeks, filtered to what the duration allows. */
export function defaultMilestoneWeeks(durationWeeks: number): number[] {
  return [1, 4, 8, 12].filter((w) => w <= durationWeeks);
}

/** Human summary of a schedule row's recurrence, e.g. "Mon, Thu · Evening". */
export function cadenceSummary(row: ScheduleRow, startDate?: string): string {
  const when =
    row.cadence === "daily"
      ? "Every day"
      : row.cadence === "specific_days"
        ? (row.days_of_week ?? []).length
          ? (row.days_of_week ?? []).map((d) => DAY_LABELS[d]).join(", ")
          : "Certain days"
        : startDate
          ? `Every ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][fromDateKey(startDate).getDay()]}`
          : "Once a week";
  const time =
    row.time_of_day === "both" ? "Morning & evening" : row.time_of_day === "morning" ? "Morning" : "Evening";
  return `${when} · ${time}`;
}
