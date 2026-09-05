// LAYER 2 INPUT — the member's week, computed DETERMINISTICALLY in code.
//
// The model never counts, never dates and never infers the gaps: it is handed
// finished arithmetic and asked only to explain the pattern. That keeps the one
// weekly call cheap, keeps the numbers correct, and means a rendering bug can
// never turn into a wrong claim about her own history.

import type { DailyHairEntry } from "@/hooks/useDailyHairEntries";
import type { UserProduct } from "@/hooks/useUserProducts";

export interface WeekProductUse {
  name: string;
  brand: string | null;
  category: string | null;
  times: number;
  /** Days of the week it appeared on, so back-to-back use is visible. */
  days: number;
}

export interface DailyWeekSummary {
  /** Inclusive local ISO date bounds of the window being described. */
  from: string;
  to: string;
  /** Entries logged in the window. */
  entries: number;
  /** Distinct days she logged something. */
  daysLogged: number;
  /** Longest run of consecutive logged days. */
  longestStreak: number;
  /** Consecutive days at the end of the window with nothing logged. */
  daysSinceLastEntry: number | null;
  products: WeekProductUse[];
  /** Product applications since her last wash day — the build-up signal. */
  applicationsSinceWash: number;
  daysSinceWash: number | null;
  /** Categories she reached for, most used first. */
  categories: string[];
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000);

/**
 * Summarise the last `days` (default 7) of daily entries.
 *
 * Returns null when there is nothing to describe — fewer than two entries is
 * not a pattern, and a card that says "you logged once" is not worth a call.
 */
export function buildDailyWeekSummary(
  entries: DailyHairEntry[],
  products: UserProduct[],
  lastWashDate: string | null,
  today: string = iso(new Date()),
  days = 7,
): DailyWeekSummary | null {
  const from = iso(new Date(new Date(`${today}T00:00:00`).getTime() - (days - 1) * 86_400_000));
  const window = entries.filter((e) => e.entry_date >= from && e.entry_date <= today);
  if (window.length < 2) return null;

  const byId = new Map(products.map((p) => [p.id, p]));

  const uses = new Map<string, { p: UserProduct; times: number; days: Set<string> }>();
  for (const e of window) {
    for (const id of e.product_ids ?? []) {
      const p = byId.get(id);
      if (!p) continue;
      const row = uses.get(id) ?? { p, times: 0, days: new Set<string>() };
      row.times += 1;
      row.days.add(e.entry_date);
      uses.set(id, row);
    }
  }

  const productRows: WeekProductUse[] = [...uses.values()]
    .map((r) => ({
      name: r.p.name,
      brand: r.p.brand,
      category: r.p.category,
      times: r.times,
      days: r.days.size,
    }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));

  const loggedDays = [...new Set(window.map((e) => e.entry_date))].sort();
  let longestStreak = loggedDays.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < loggedDays.length; i++) {
    run = dayDiff(loggedDays[i], loggedDays[i - 1]) === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
  }

  const lastEntryDay = loggedDays[loggedDays.length - 1] ?? null;
  const sinceWash = lastWashDate
    ? window.filter((e) => e.entry_date >= lastWashDate)
    : window;

  const catCount = new Map<string, number>();
  for (const r of productRows) {
    if (!r.category) continue;
    catCount.set(r.category, (catCount.get(r.category) ?? 0) + r.times);
  }

  return {
    from,
    to: today,
    entries: window.length,
    daysLogged: loggedDays.length,
    longestStreak,
    daysSinceLastEntry: lastEntryDay ? dayDiff(today, lastEntryDay) : null,
    products: productRows,
    applicationsSinceWash: sinceWash.reduce((n, e) => n + (e.product_ids?.length ?? 0), 0),
    daysSinceWash: lastWashDate ? dayDiff(today, lastWashDate) : null,
    categories: [...catCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c),
  };
}

/** Stable weekly signature: the ISO week plus the shape of the window. Only a
 *  new week or genuinely different entries can move it, so viewing the card
 *  never spends a token. */
export function weekSignatureParts(summary: DailyWeekSummary): string[] {
  return [
    summary.to.slice(0, 7),
    `w${summary.from}`,
    `e${summary.entries}`,
    `d${summary.daysLogged}`,
    `a${summary.applicationsSinceWash}`,
    ...summary.products.map((p) => `${p.name}x${p.times}`),
  ];
}
