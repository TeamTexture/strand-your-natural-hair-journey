// washHistoryAggregate — collapses EVERY logged wash day into one compact
// picture for AI generation.
//
// The wash day tip is written from patterns across the whole history (cadence,
// recurring breakage, heat frequency, product rotation, how her hair has felt),
// not from the most recent log alone. This module does the aggregation on the
// client so the edge function receives a small, stable payload, and exposes
// signature parts so the cached tip invalidates when the picture changes.

export interface AggregatableWashDay {
  id: string;
  wash_date: string;
  steps?: Array<{ name?: string; product_name?: string | null }> | null;
  heat_treatment?: unknown;
  styling?: unknown;
  scalp_feel?: string | null;
  breakage?: string | null;
  hair_feel_note?: string | null;
  hair_feel_voice_url?: string | null;
  style_after?: string | null;
  style_extensions?: boolean | null;
  style_tension?: string | null;
  product_ids?: string[] | null;
}

export interface WashHistoryAggregate {
  /** Total published wash days on record. */
  totalLogs: number;
  firstLogDate: string | null;
  latestLogDate: string | null;
  /** Mean days between consecutive logs (null with fewer than two logs). */
  averageGapDays: number | null;
  /** Days since the most recent log. */
  daysSinceLastLog: number | null;
  /** How many logs recorded heat under a step. */
  logsWithHeat: number;
  /** How many logs recorded blow drying / flat ironing at the styling step. */
  logsWithThermalStyling: number;
  /** Breakage answers counted by the answer she gave. */
  breakageCounts: Record<string, number>;
  /** Scalp answers counted by the answer she gave. */
  scalpCounts: Record<string, number>;
  /** How often each wash step appears across the history. */
  stepCounts: Record<string, number>;
  /** Product rotation — product names used, most-used first. */
  productRotation: Array<{ name: string; uses: number }>;
  /** Distinct styles worn after a wash, most recent first. */
  recentStyles: string[];
  /** How her hair has felt, most recent first (includes voice transcripts). */
  hairFeelNotes: Array<{ date: string; note: string }>;
  /** Logs whose "how it feels" answer came from a voice note. */
  voiceNoteCount: number;
}

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

const usedHeatInLog = (wd: AggregatableWashDay): boolean => {
  const steps = Array.isArray(wd.steps) ? wd.steps : [];
  // A step's heat object exists whenever the question was ANSWERED — including
  // an explicit "no" ({ used: false }). Only used === true (or a real duration)
  // counts as heat, otherwise answering "no" would read as heat used.
  const stepUsed = steps.some((s) => {
    const heat = (s as { heat?: { used?: boolean; duration_min?: number } | null } | null)?.heat;
    if (!heat) return false;
    if (heat.used === true) return true;
    if (heat.used === false) return false;
    return typeof heat.duration_min === "number" && heat.duration_min > 0;
  });
  if (stepUsed) return true;
  const roll = wd.heat_treatment as { used?: boolean; duration_min?: number } | null;
  if (!roll) return false;
  if (roll.used === true) return true;
  if (roll.used === false) return false;
  return typeof roll.duration_min === "number" && roll.duration_min > 0;
};


const usedThermalStyling = (wd: AggregatableWashDay): boolean => {
  const styling = wd.styling as { heat?: Record<string, unknown> } | null;
  const heat = styling?.heat as Record<string, unknown> | undefined;
  if (!heat) return false;
  return Object.values(heat).some((v) => v === true || (typeof v === "object" && v !== null));
};

const bump = (map: Record<string, number>, key: string | null | undefined) => {
  const k = String(key ?? "").trim();
  if (!k) return;
  map[k] = (map[k] ?? 0) + 1;
};

/** Aggregates ALL logs (expects newest-first, but sorts defensively). */
export function aggregateWashHistory(
  logs: AggregatableWashDay[],
  today: Date = new Date(),
): WashHistoryAggregate {
  const sorted = [...logs]
    .filter((w) => Boolean(w?.wash_date))
    .sort((a, b) => (a.wash_date < b.wash_date ? 1 : -1)); // newest first

  const breakageCounts: Record<string, number> = {};
  const scalpCounts: Record<string, number> = {};
  const stepCounts: Record<string, number> = {};
  const productUses = new Map<string, number>();
  const styles: string[] = [];
  const hairFeelNotes: Array<{ date: string; note: string }> = [];

  let logsWithHeat = 0;
  let logsWithThermalStyling = 0;
  let voiceNoteCount = 0;

  for (const wd of sorted) {
    bump(breakageCounts, wd.breakage);
    bump(scalpCounts, wd.scalp_feel);
    for (const s of Array.isArray(wd.steps) ? wd.steps : []) {
      bump(stepCounts, s?.name);
      const pn = String(s?.product_name ?? "").trim();
      if (pn) productUses.set(pn, (productUses.get(pn) ?? 0) + 1);
    }
    if (usedHeatInLog(wd)) logsWithHeat += 1;
    if (usedThermalStyling(wd)) logsWithThermalStyling += 1;
    if (wd.hair_feel_voice_url) voiceNoteCount += 1;
    const style = String(wd.style_after ?? "").trim();
    if (style && !styles.includes(style)) styles.push(style);
    const note = String(wd.hair_feel_note ?? "").trim();
    if (note) hairFeelNotes.push({ date: wd.wash_date, note });
  }

  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const gap = dayDiff(sorted[i].wash_date, sorted[i + 1].wash_date);
    if (gap > 0 && gap < 200) gaps.push(gap);
  }

  const latestLogDate = sorted[0]?.wash_date ?? null;

  return {
    totalLogs: sorted.length,
    firstLogDate: sorted[sorted.length - 1]?.wash_date ?? null,
    latestLogDate,
    averageGapDays: gaps.length
      ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
      : null,
    daysSinceLastLog: latestLogDate
      ? Math.max(0, dayDiff(today.toISOString().slice(0, 10), latestLogDate))
      : null,
    logsWithHeat,
    logsWithThermalStyling,
    breakageCounts,
    scalpCounts,
    stepCounts,
    productRotation: [...productUses.entries()]
      .map(([name, uses]) => ({ name, uses }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 12),
    recentStyles: styles.slice(0, 6),
    // Newest first, capped — the model needs the recent voice of her hair, not
    // the full archive.
    hairFeelNotes: hairFeelNotes.slice(0, 6),
    voiceNoteCount,
  };
}

/**
 * Stable signature fragments for the aggregate. A new log, a change in
 * cadence, breakage pattern, heat frequency or product rotation all move the
 * hash, so the cached tip regenerates.
 */
export const washHistorySignatureParts = (agg: WashHistoryAggregate): string[] => {
  const counts = (m: Record<string, number>) =>
    Object.entries(m)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
  return [
    `logs:${agg.totalLogs}`,
    `latest:${agg.latestLogDate ?? ""}`,
    `gap:${agg.averageGapDays ?? ""}`,
    `heat:${agg.logsWithHeat}`,
    `thermal:${agg.logsWithThermalStyling}`,
    `breakage:${counts(agg.breakageCounts)}`,
    `scalp:${counts(agg.scalpCounts)}`,
    `steps:${counts(agg.stepCounts)}`,
    `rotation:${agg.productRotation.map((p) => `${p.name}x${p.uses}`).join("|")}`,
    `feel:${agg.hairFeelNotes.map((n) => `${n.date}#${n.note.length}`).join("|")}`,
    `voice:${agg.voiceNoteCount}`,
  ];
};
