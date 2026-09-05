// The single step set used by the simplified wash-day log.
//
// `stored` is what goes into `wash_days.steps[].name` — the historical strings
// are preserved exactly ("Pre-poo", "Cleanse", "Condition") so old logs and the
// AI insight matching keep working. New slots ("Leave-in", "Moisturise",
// "Style") are additive.

import type { StepProductHint } from "@/lib/productCategories";

export interface WashLogStep {
  /** Stored value in wash_days.steps[].name and wash_day_favourites.step. */
  stored: string;
  /** Member-facing label. */
  label: string;
  /** Which shelf categories to hoist in the product picker. */
  hint: StepProductHint;
}

export const WASH_LOG_STEPS: readonly WashLogStep[] = [
  { stored: "Pre-poo", label: "Pre-poo", hint: "prepoo" },
  { stored: "Cleanse", label: "Cleanse", hint: "cleanse" },
  { stored: "Condition", label: "Deep condition", hint: "condition" },
  { stored: "Leave-in", label: "Leave-in", hint: "condition" },
  { stored: "Moisturise", label: "Moisturise", hint: "condition" },
  { stored: "Style", label: "Style", hint: "treatment" },
] as const;

/** Today's date in the member's own timezone, as YYYY-MM-DD. */
export const localIsoDate = (d = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Thursday 4 September" — never an ISO timestamp on screen. */
export const friendlyWashDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = localIsoDate();
  if (iso === today) return `Today, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${days[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
