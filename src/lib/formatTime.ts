/**
 * Format a "HH:MM" or "HH:MM:SS" 24h time string into a 12h clock with am/pm.
 * Returns empty string for null/invalid input.
 */
export function formatTime12h(time: string | null | undefined): string {
  if (!time) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;
  let h = parseInt(match[1], 10);
  const m = match[2];
  if (isNaN(h)) return time;
  const suffix = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m}${suffix}`;
}
