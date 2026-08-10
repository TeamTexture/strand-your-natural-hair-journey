/**
 * WEEKLY CHECK-IN CONFIG.
 *
 * The metric set is data, not markup. The check-in screen renders whatever this
 * array contains, so a plan can later carry its own set (professional-authored
 * or condition-specific) without touching the component.
 *
 * Every step of every slider has a plain-language label. A member never sees a
 * bare number and never sees a grade — the wording describes what's happening,
 * not how well they did.
 */

export interface CheckinMetric {
  /** Stable key written into treatment_plan_checkins.ratings. Never renamed. */
  key: string;
  label: string;
  /** One line under the label, in the app's voice. */
  helper: string;
  /** Index = value 1…5. Read left (harder) to right (easier). */
  scale: [string, string, string, string, string];
}

/** Default four. Read from here — never hardcode a metric in a component. */
export const CHECKIN_METRICS: CheckinMetric[] = [
  {
    key: "scalp_comfort",
    label: "Scalp comfort",
    helper: "How your scalp has felt this week.",
    scale: ["Sore or itchy", "A bit tender", "Settled", "Comfortable", "Good"],
  },
  {
    key: "breakage",
    label: "Breakage",
    helper: "Short broken pieces you're seeing.",
    scale: ["A lot more", "A little more", "About the same", "Less than before", "Hardly any"],
  },
  {
    key: "moisture_retention",
    label: "Moisture retention",
    helper: "How long your hair stays soft after wash day.",
    scale: ["Dry by the next day", "Dries out fast", "About the same", "Holding", "Holding well"],
  },
  {
    key: "shedding",
    label: "Shedding",
    helper: "Full-length strands coming away.",
    scale: ["A lot more", "A little more", "About the same", "Less than before", "Hardly any"],
  },
];

/** Neutral middle of the scale — where every slider starts. */
export const CHECKIN_DEFAULT_VALUE = 3;

export type CheckinRatings = Record<string, number>;

export const defaultRatings = (metrics: CheckinMetric[] = CHECKIN_METRICS): CheckinRatings =>
  Object.fromEntries(metrics.map((m) => [m.key, CHECKIN_DEFAULT_VALUE]));

/** The words a stored value maps to, for the check-in and the progress view. */
export function ratingLabel(metric: CheckinMetric, value: number): string {
  const i = Math.min(metric.scale.length, Math.max(1, Math.round(value))) - 1;
  return metric.scale[i];
}

/** Merges stored ratings over the defaults so a new metric can't render blank. */
export function ratingsWithDefaults(
  stored: unknown,
  metrics: CheckinMetric[] = CHECKIN_METRICS,
): CheckinRatings {
  const base = defaultRatings(metrics);
  if (stored && typeof stored === "object") {
    for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) base[k] = v;
    }
  }
  return base;
}
