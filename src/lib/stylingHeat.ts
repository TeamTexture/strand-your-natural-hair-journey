// THERMAL STYLING HEAT — blow dryer / flat iron.
//
// This is deliberately SEPARATE from conditioning heat (`wash_days.heat_treatment`
// and per-step `steps[].heat`, i.e. a heat cap or hood worn under a conditioner
// or treatment). The two have opposite clinical implications — one is a moisture
// benefit, the other a damage risk — so they must stay independently queryable
// and must never share fields.
//
// Storage: nested inside the existing `wash_days.styling` jsonb as
// `styling.heat`, with stable snake_case keys:
//   { used, methods: ["blow_dry","flat_iron"], level: "high" | "low",
//     protectant_used }
// `methods` is an array and `level` sits alongside it, so per-method levels can
// be added later (e.g. `method_levels`) with no migration.

export type StylingHeatMethod = "blow_dry" | "flat_iron";
export type StylingHeatLevel = "high" | "low";

export interface StylingHeat {
  used?: boolean | null;
  methods?: StylingHeatMethod[];
  level?: StylingHeatLevel | null;
  protectant_used?: boolean | null;
}

export const STYLING_HEAT_METHOD_CHOICES = [
  { value: "blow_dry", label: "Blow dry" },
  { value: "flat_iron", label: "Straightened / flat iron" },
];

export const STYLING_HEAT_LEVEL_CHOICES = [
  { value: "high", label: "High heat" },
  { value: "low", label: "Low heat" },
];

export const STYLING_HEAT_YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const STYLING_HEAT_METHOD_LABELS: Record<StylingHeatMethod, string> = {
  blow_dry: "Blow dry",
  flat_iron: "Flat iron",
};

/** Read `styling.heat` off a wash day row, tolerating legacy/absent shapes. */
export function stylingHeatOf(styling: unknown): StylingHeat | null {
  if (!styling || typeof styling !== "object") return null;
  const heat = (styling as Record<string, unknown>).heat;
  if (!heat || typeof heat !== "object") return null;
  const h = heat as Record<string, unknown>;
  const methods = Array.isArray(h.methods)
    ? (h.methods.filter((m): m is StylingHeatMethod => m === "blow_dry" || m === "flat_iron"))
    : [];
  const level = h.level === "high" || h.level === "low" ? h.level : null;
  return {
    used: typeof h.used === "boolean" ? h.used : null,
    methods,
    level,
    protectant_used: typeof h.protectant_used === "boolean" ? h.protectant_used : null,
  };
}

/** Human summary — data read-out only, no advice. */
export function describeStylingHeat(heat: StylingHeat | null): string | null {
  if (!heat || heat.used !== true) {
    return heat?.used === false ? "No heat styling" : null;
  }
  const bits: string[] = [];
  if (heat.methods?.length) {
    bits.push(heat.methods.map((m) => STYLING_HEAT_METHOD_LABELS[m]).join(" + "));
  } else {
    bits.push("Heat styling");
  }
  if (heat.level) bits.push(`${heat.level === "high" ? "High" : "Low"} heat`);
  if (heat.protectant_used === true) bits.push("Heat protectant used");
  if (heat.protectant_used === false) bits.push("No heat protectant");
  return bits.join(" · ");
}

/**
 * Rolling count of logged wash days in the trailing 7 days whose STYLING heat
 * methods include a blow dry. Derived from logs — no self-reported count.
 *
 * Known limitation: heat styling done between wash days is not logged, so this
 * is a floor, not a true total.
 */
export function blowDryCountLast7Days(
  rows: Array<{ wash_date?: string | null; styling?: unknown }>,
  now: Date = new Date(),
): number {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return rows.filter((r) => {
    const d = r.wash_date ?? "";
    if (!d || d < cutoffIso || d > todayIso) return false;
    const heat = stylingHeatOf(r.styling);
    return heat?.used === true && (heat.methods ?? []).includes("blow_dry");
  }).length;
}
