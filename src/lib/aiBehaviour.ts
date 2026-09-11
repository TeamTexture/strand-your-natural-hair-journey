// aiBehaviour — pure derivations of the member's BEHAVIOUR from her logged wash
// days, plus the professional-recommendation merge. Kept separate from
// aiContext.ts so each derivation is unit-testable without a network layer.
//
// Nothing here invents data: every field returns undefined when there is not
// enough on record to answer it honestly. Prompts must treat an absent field as
// "not established", never as a zero.

import { aggregateWashHistory, type AggregatableWashDay } from "@/lib/washHistoryAggregate";

export type WashFrequency = "weekly" | "bi-weekly" | "monthly" | "sporadic";
export type WashConsistency = "sporadic" | "regular" | "very regular";
export type HeatFrequency = "never" | "monthly" | "weekly" | "daily";
export type BreakageSeverity = "none" | "minimal" | "moderate" | "high";

export interface BehaviourSlice {
  wash_count_30d: number;
  wash_count_90d: number;
  wash_frequency?: WashFrequency;
  wash_consistency?: WashConsistency;
  average_gap_days?: number;
  heat_frequency?: HeatFrequency;
  /** Share of recent washes finished WITHOUT thermal styling heat (0–100). */
  air_dry_percentage?: number;
  breakage_severity?: BreakageSeverity;
}

export interface RecentProductUse {
  name: string;
  brand?: string | null;
  category?: string | null;
  last_used: string;
}

const DAY = 86_400_000;

const withinDays = (iso: string | null | undefined, days: number, now: Date): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= days * DAY;
};

/** Maps her own breakage answers to a severity band. Weighted by how often the
 *  worse answers appear, not by the single most recent log. */
export function deriveBreakageSeverity(
  counts: Record<string, number>,
): BreakageSeverity | undefined {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return undefined;
  let total = 0;
  let score = 0;
  for (const [answer, n] of entries) {
    const a = answer.toLowerCase();
    let weight: number | null = null;
    if (/none|^no\b|nothing/.test(a)) weight = 0;
    else if (/minimal|a bit|a little|light|slight/.test(a)) weight = 1;
    else if (/some|moderate|noticeab/.test(a)) weight = 2;
    else if (/a lot|lots|heavy|excess|high|significant/.test(a)) weight = 3;
    if (weight === null) continue;
    total += n;
    score += weight * n;
  }
  if (total === 0) return undefined;
  const mean = score / total;
  if (mean === 0) return "none";
  if (mean < 1.34) return "minimal";
  if (mean < 2.34) return "moderate";
  return "high";
}

function frequencyFromGap(gap: number | null, count30: number): WashFrequency | undefined {
  if (gap != null) {
    if (gap <= 9) return "weekly";
    if (gap <= 20) return "bi-weekly";
    if (gap <= 45) return "monthly";
    return "sporadic";
  }
  if (count30 >= 3) return "weekly";
  if (count30 >= 1) return "bi-weekly";
  return undefined;
}

function consistencyFrom(gaps: number[]): WashConsistency | undefined {
  if (gaps.length < 3) return undefined;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return undefined;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv <= 0.25) return "very regular";
  if (cv <= 0.6) return "regular";
  return "sporadic";
}

function heatFrequencyFrom(
  logsWithThermal: number,
  totalLogs: number,
  averageGapDays: number | null,
): HeatFrequency | undefined {
  if (totalLogs === 0) return undefined;
  if (logsWithThermal === 0) return "never";
  const share = logsWithThermal / totalLogs;
  const gap = averageGapDays ?? 14;
  // Heat lands on a wash day, so its real-world cadence is the wash cadence
  // scaled by how often heat appears in a wash.
  const daysBetweenHeat = gap / Math.max(share, 0.01);
  if (daysBetweenHeat <= 2) return "daily";
  if (daysBetweenHeat <= 16) return "weekly";
  return "monthly";
}

/** Derives the behaviour slice from her logged wash days (newest first or any
 *  order — sorted defensively). Returns undefined when nothing is logged. */
export function deriveBehaviour(
  logs: AggregatableWashDay[],
  now: Date = new Date(),
): BehaviourSlice | undefined {
  const rows = (logs ?? []).filter((w) => Boolean(w?.wash_date));
  if (rows.length === 0) return undefined;
  const agg = aggregateWashHistory(rows, now);
  const sorted = [...rows].sort((a, b) => (a.wash_date < b.wash_date ? 1 : -1));
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const gap = Math.round(
      (new Date(sorted[i].wash_date).getTime() - new Date(sorted[i + 1].wash_date).getTime()) / DAY,
    );
    if (gap > 0 && gap < 200) gaps.push(gap);
  }
  const count30 = rows.filter((w) => withinDays(w.wash_date, 30, now)).length;
  const count90 = rows.filter((w) => withinDays(w.wash_date, 90, now)).length;
  const airDry =
    agg.totalLogs > 0
      ? Math.round(((agg.totalLogs - agg.logsWithThermalStyling) / agg.totalLogs) * 100)
      : undefined;

  const slice: BehaviourSlice = {
    wash_count_30d: count30,
    wash_count_90d: count90,
  };
  const freq = frequencyFromGap(agg.averageGapDays, count30);
  if (freq) slice.wash_frequency = freq;
  const consistency = consistencyFrom(gaps);
  if (consistency) slice.wash_consistency = consistency;
  if (agg.averageGapDays != null) slice.average_gap_days = agg.averageGapDays;
  const heat = heatFrequencyFrom(agg.logsWithThermalStyling, agg.totalLogs, agg.averageGapDays);
  if (heat) slice.heat_frequency = heat;
  if (airDry != null) slice.air_dry_percentage = airDry;
  const breakage = deriveBreakageSeverity(agg.breakageCounts);
  if (breakage) slice.breakage_severity = breakage;
  return slice;
}

/** Products she actually reached for in her recent washes, newest use first. */
export function deriveRecentProductsUsed(
  logs: Array<{ wash_date: string; product_ids?: string[] | null }>,
  products: Array<{ id: string; name?: string | null; brand?: string | null; category?: string | null }>,
  limit = 12,
): RecentProductUse[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lastUsed = new Map<string, string>();
  for (const log of logs ?? []) {
    for (const id of log.product_ids ?? []) {
      const prev = lastUsed.get(id);
      if (!prev || String(log.wash_date) > prev) lastUsed.set(id, String(log.wash_date));
    }
  }
  return [...lastUsed.entries()]
    .map(([id, last_used]) => {
      const p = byId.get(id);
      if (!p?.name) return null;
      return {
        name: String(p.name),
        brand: p.brand ?? null,
        category: p.category ?? null,
        last_used,
      } satisfies RecentProductUse;
    })
    .filter((p): p is RecentProductUse => p !== null)
    .sort((a, b) => (a.last_used < b.last_used ? 1 : -1))
    .slice(0, limit);
}

/** Merges what her professionals have told her: the onboarding consultation
 *  notes plus the notes on her recent appointments. Returns undefined when
 *  nothing was written down. */
export function mergeProfessionalRecommendations(
  consultationNotes: string | null | undefined,
  appointments: Array<{
    appointment_date?: string | null;
    professional_name?: string | null;
    notes?: string | null;
    outcome_notes?: string | null;
  }>,
  limit = 5,
): string | undefined {
  const parts: string[] = [];
  const consult = String(consultationNotes ?? "").trim();
  if (consult) parts.push(`Consultation notes: ${consult}`);
  for (const a of (appointments ?? []).slice(0, limit)) {
    const body = [a.notes, a.outcome_notes]
      .map((t) => String(t ?? "").trim())
      .filter(Boolean)
      .join(" — ");
    if (!body) continue;
    const who = String(a.professional_name ?? "").trim();
    const when = String(a.appointment_date ?? "").trim();
    const head = [when, who].filter(Boolean).join(", ");
    parts.push(head ? `${head}: ${body}` : body);
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n").slice(0, 2000);
}
