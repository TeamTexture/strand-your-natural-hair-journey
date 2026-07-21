/**
 * formatPassportDate.ts — the single date/time formatter used by the passport.
 * No ISO strings, no toLocaleDateString ad-hoc calls, no bespoke "days ago" logic.
 */

const parse = (iso: string | Date | null | undefined): Date | null => {
  if (!iso) return null;
  if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;
  // Support "YYYY-MM-DD" and full ISO alike.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "12 Mar 2026" — always day / short-month / year. */
export const formatDate = (iso: string | Date | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** "12 Mar 2026, 14:30" — friendly datetime. */
export const formatDateTime = (iso: string | Date | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

/** "Mar 2026" — for "member since" copy. */
export const formatMonth = (iso: string | Date | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "5 months ago", "2 years ago". */
export const formatRelative = (iso: string | Date | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "—";
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 0) {
    const inDays = -diffDays;
    if (inDays === 0) return "Today";
    if (inDays === 1) return "Tomorrow";
    if (inDays < 7) return `In ${inDays} days`;
    if (inDays < 30) return `In ${Math.round(inDays / 7)} week${Math.round(inDays / 7) === 1 ? "" : "s"}`;
    if (inDays < 365) return `In ${Math.round(inDays / 30)} month${Math.round(inDays / 30) === 1 ? "" : "s"}`;
    return `In ${Math.round(inDays / 365)} year${Math.round(inDays / 365) === 1 ? "" : "s"}`;
  }
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const w = Math.round(diffDays / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (diffDays < 365) {
    const m = Math.round(diffDays / 30);
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  const y = Math.round(diffDays / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
};

/** "12 Mar 2026 · 3 weeks ago" — for card metadata lines. */
export const formatDateWithRelative = (iso: string | Date | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "—";
  return `${formatDate(iso)} · ${formatRelative(iso)}`;
};
