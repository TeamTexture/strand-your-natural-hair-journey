import { Ruler, Droplets, Shield, Sparkles, Target, Scissors, type LucideIcon } from "lucide-react";
import { challengeSummary, challengesOf } from "@/lib/goalChallenges";

/** Map a goal to its medallion icon using kind first, then its own words. */
export const goalIcon = (goal: {
  kind?: string | null;
  title?: string | null;
  challenges?: string[] | null;
  challenge?: string | null;
  target_text?: string | null;
}): LucideIcon => {
  const kind = (goal.kind ?? "").toLowerCase();
  if (kind.includes("length")) return Ruler;
  const text = [goal.title, ...challengesOf(goal), goal.target_text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/length|grow|retain|inches|longer/.test(text)) return Ruler;
  if (/moist|hydrat|dry|water/.test(text)) return Droplets;
  if (/strength|breakage|protein|snap|strong/.test(text)) return Shield;
  if (/trim|ends|split/.test(text)) return Scissors;
  if (/scalp|health|shine|condition/.test(text)) return Sparkles;
  return Target;
};

/** Human label for the goal's headline line. */
export const goalTitle = (goal: {
  title?: string | null;
  challenges?: string[] | null;
  challenge?: string | null;
}): string => (challengeSummary(goal) || goal.title?.trim() || "Your hair goal");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "Mar–Jul 2026" style range chip for a finished goal. */
export const goalDateRange = (startedAt?: string | null, endedAt?: string | null): string => {
  const s = startedAt ? new Date(startedAt) : null;
  const e = endedAt ? new Date(endedAt) : null;
  if (!s || Number.isNaN(s.getTime())) return "";
  const sLabel = MONTHS[s.getMonth()];
  if (!e || Number.isNaN(e.getTime())) return `${sLabel} ${s.getFullYear()} — now`;
  const sameYear = s.getFullYear() === e.getFullYear();
  return sameYear
    ? `${sLabel}–${MONTHS[e.getMonth()]} ${e.getFullYear()}`
    : `${sLabel} ${s.getFullYear()}–${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
};

/** Whole weeks elapsed between two dates, minimum 1. */
export const weeksBetween = (from?: string | null, to?: string | null): number | null => {
  if (!from) return null;
  const a = new Date(from);
  if (Number.isNaN(a.getTime())) return null;
  const b = to ? new Date(to) : new Date();
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return 1;
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)) + 1);
};

/** "18 weeks" duration label for a past goal. */
export const goalDuration = (startedAt?: string | null, endedAt?: string | null): string => {
  const w = weeksBetween(startedAt, endedAt);
  if (!w) return "";
  return w === 1 ? "1 week" : `${w} weeks`;
};

/** Measurable progress percentage, or null when the goal has no numbers. */
export const goalProgressPct = (goal: {
  target_value?: number | null;
  current_value?: number | null;
  start_value?: number | null;
}): number | null => {
  if (goal.target_value == null) return null;
  const start = goal.start_value ?? 0;
  const span = (goal.target_value ?? 0) - start;
  if (span <= 0) return null;
  const done = Math.min(Math.max((goal.current_value ?? start) - start, 0), span);
  return Math.round((done / span) * 100);
};
