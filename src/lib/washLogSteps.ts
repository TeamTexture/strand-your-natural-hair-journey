// The single step set used by the simplified wash-day log and by Wash Day
// Favourites.
//
// PRINCIPLE: products belong to STEPS, not categories. Any product may sit in
// any slot — the shelf picker never filters, it only hoists the categories a
// step usually needs.
//
// `stored` is what goes into `wash_days.steps[].name` and
// `wash_day_favourites.step`. Historical strings are preserved exactly
// ("Pre-poo", "Cleanse", "Condition", "Style") so old logs, favourites and the
// AI insight matching keep working. Extra slots are additive new names.

import type { StepProductHint } from "@/lib/productCategories";

export interface WashLogStep {
  /** Stored value in wash_days.steps[].name and wash_day_favourites.step. */
  stored: string;
  /** Member-facing label for this slot. */
  label: string;
  /** Which shelf categories to hoist in the product picker. */
  hint: StepProductHint;
}

export interface WashLogGroup {
  key: string;
  /** Uppercase step heading. */
  label: string;
  hint: StepProductHint;
  /** Ordered slots. Every slot is optional and independent. */
  slots: readonly WashLogStep[];
  /**
   * Dynamic groups reveal one empty slot at a time and stop offering "add"
   * once every slot is filled (Style, up to five products).
   */
  dynamic?: boolean;
  /**
   * Optional steps she can mark as deliberately skipped instead of leaving
   * blank. ONLY Pre-poo and Mask — Cleanse and Condition never offer a skip.
   */
  skippable?: boolean;
}


const styleSlots: WashLogStep[] = [
  { stored: "Style", label: "Styler", hint: "treatment" },
  ...[2, 3, 4, 5].map((i) => ({
    stored: `Style ${i}`,
    label: "Styler",
    hint: "treatment" as StepProductHint,
  })),
];

export const WASH_LOG_GROUPS: readonly WashLogGroup[] = [
  {
    key: "prepoo",
    label: "Pre-poo",
    hint: "prepoo",
    skippable: true,
    slots: [{ stored: "Pre-poo", label: "Pre-poo", hint: "prepoo" }],
  },
  {
    key: "cleanse",
    label: "Cleanse",
    hint: "cleanse",
    slots: [
      { stored: "Cleanse", label: "All-purpose cleanse", hint: "cleanse" },
      { stored: "Moisturising cleanse", label: "Moisturising cleanse", hint: "cleanse" },
    ],
  },
  {
    key: "condition",
    label: "Condition",
    hint: "condition",
    slots: [
      { stored: "Condition", label: "Conditioner", hint: "condition" },
      { stored: "Condition 2", label: "Second conditioner", hint: "condition" },
    ],
  },
  {
    key: "mask",
    label: "Mask",
    hint: "condition",
    skippable: true,
    slots: [
      { stored: "Mask", label: "Mask", hint: "condition" },
      { stored: "Mask 2", label: "Second mask", hint: "condition" },
    ],
  },
  {
    key: "leavein",
    label: "Leave-in",
    hint: "condition",
    slots: [{ stored: "Leave-in", label: "Leave-in", hint: "condition" }],
  },
  {
    // Replaces the old "Moisturise" slot. Historical logs and favourites still
    // hold the string "Moisturise" and keep rendering through WASH_STEP_LABEL.
    key: "oil",
    label: "Oil (Sealant)",
    hint: "condition",
    slots: [{ stored: "Oil (Sealant)", label: "Oil (Sealant)", hint: "condition" }],
  },
  {
    key: "style",
    label: "Style",
    hint: "treatment",
    slots: styleSlots,
    dynamic: true,
  },
] as const;

/** Flat ordered slot list — save, pre-fill and favourites all iterate this. */
/** Steps that may be marked skipped — Pre-poo and Mask slots only. */
export const SKIPPABLE_STEPS: ReadonlySet<string> = new Set(
  WASH_LOG_GROUPS.filter((g) => g.skippable).flatMap((g) => g.slots.map((s) => s.stored)),
);

export const WASH_LOG_STEPS: readonly WashLogStep[] = WASH_LOG_GROUPS.flatMap(
  (g) => g.slots,
);

/**
 * How many slots of a dynamic group to render: every filled slot plus one
 * empty, capped at the group's slot count.
 */
export const visibleSlotCount = (
  group: WashLogGroup,
  isFilled: (stored: string) => boolean,
): number => {
  if (!group.dynamic) return group.slots.length;
  let filled = 0;
  group.slots.forEach((s) => {
    if (isFilled(s.stored)) filled += 1;
  });
  return Math.min(group.slots.length, Math.max(1, filled + 1));
};

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
