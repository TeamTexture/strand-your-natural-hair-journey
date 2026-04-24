// Reference ranges & evaluation for blood markers used in onboarding.
export type BloodStatus = "low" | "normal" | "high" | "untested";

export interface BloodRange {
  marker: string;
  unit: string;
  low?: number; // value < low => LOW
  high?: number; // value > high => HIGH
  // If value is between [low, high] inclusive => NORMAL.
  // If only `high` is set, value <= high => NORMAL, > high => HIGH.
  // If only `low` is set, value >= low => NORMAL, < low => LOW.
  category: "iron" | "vitamins" | "minerals" | "inflammation" | "thyroid" | "hormones";
  // Optional pre-diabetic band for HbA1c
  preDiabeticLow?: number;
  preDiabeticHigh?: number;
}

export const BLOOD_RANGES: Record<string, BloodRange> = {
  // Iron & storage
  Ferritin: { marker: "Ferritin", unit: "ng/mL", low: 30, high: 150, category: "iron" },
  "Serum Iron": { marker: "Serum Iron", unit: "μmol/L", low: 10, high: 30, category: "iron" },
  TIBC: { marker: "TIBC", unit: "μmol/L", low: 45, high: 72, category: "iron" },
  "Transferrin Saturation": { marker: "Transferrin Saturation", unit: "%", low: 16, high: 45, category: "iron" },

  // Vitamins
  "Vitamin D": { marker: "Vitamin D", unit: "nmol/L", low: 50, high: 250, category: "vitamins" },
  "Vitamin B12": { marker: "Vitamin B12", unit: "pmol/L", low: 200, high: 900, category: "vitamins" },
  Folate: { marker: "Folate", unit: "nmol/L", low: 7, high: 45, category: "vitamins" },
  "Vitamin A": { marker: "Vitamin A", unit: "μmol/L", low: 1.05, high: 2.27, category: "vitamins" },
  "Vitamin E": { marker: "Vitamin E", unit: "μmol/L", low: 12, high: 42, category: "vitamins" },
  Biotin: { marker: "Biotin", unit: "pg/mL", low: 100, high: 500, category: "vitamins" },

  // Minerals
  Zinc: { marker: "Zinc", unit: "μmol/L", low: 11, high: 24, category: "minerals" },
  Magnesium: { marker: "Magnesium", unit: "mmol/L", low: 0.7, high: 1.0, category: "minerals" },
  Selenium: { marker: "Selenium", unit: "μmol/L", low: 0.89, high: 1.65, category: "minerals" },
  Copper: { marker: "Copper", unit: "μmol/L", low: 11, high: 22, category: "minerals" },

  // Inflammation & general
  CRP: { marker: "CRP", unit: "mg/L", high: 5, category: "inflammation" },
  "Blood Glucose": { marker: "Blood Glucose", unit: "mmol/L", low: 3.9, high: 5.5, category: "inflammation" },
  Albumin: { marker: "Albumin", unit: "g/L", low: 35, high: 50, category: "inflammation" },
  HbA1c: {
    marker: "HbA1c",
    unit: "mmol/mol",
    high: 42,
    preDiabeticLow: 42,
    preDiabeticHigh: 47,
    category: "inflammation",
  },
  FBC: { marker: "FBC", unit: "", category: "inflammation" },
  ESR: { marker: "ESR", unit: "mm/hr", category: "inflammation" },
  ANA: { marker: "ANA", unit: "titre", category: "inflammation" },

  // Thyroid
  TSH: { marker: "TSH", unit: "mU/L", low: 0.4, high: 4.0, category: "thyroid" },
  "Free T3": { marker: "Free T3", unit: "pmol/L", low: 3.1, high: 6.8, category: "thyroid" },
  "Free T4": { marker: "Free T4", unit: "pmol/L", low: 12, high: 22, category: "thyroid" },
  "Thyroid Antibodies (TPO)": { marker: "Thyroid Antibodies (TPO)", unit: "IU/mL", high: 35, category: "thyroid" },

  // Hormones
  "Oestrogen / Oestradiol": { marker: "Oestrogen / Oestradiol", unit: "pmol/L", low: 110, high: 800, category: "hormones" },
  Testosterone: { marker: "Testosterone", unit: "nmol/L", low: 0.3, high: 2.4, category: "hormones" },
  "DHEA-S": { marker: "DHEA-S", unit: "μmol/L", low: 1.6, high: 9.8, category: "hormones" },
  Prolactin: { marker: "Prolactin", unit: "mIU/L", high: 500, category: "hormones" },
  FSH: { marker: "FSH", unit: "IU/L", low: 3, high: 10, category: "hormones" },
  LH: { marker: "LH", unit: "IU/L", low: 2, high: 15, category: "hormones" },
  Cortisol: { marker: "Cortisol", unit: "nmol/L", low: 170, high: 540, category: "hormones" },
  "Insulin / HbA1c": { marker: "Insulin / HbA1c", unit: "mmol/mol", high: 42, category: "hormones" },
};

export function evaluate(marker: string, value: number | null | undefined): BloodStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return "untested";
  const r = BLOOD_RANGES[marker];
  if (!r) return "untested";
  if (r.low !== undefined && value < r.low) return "low";
  if (r.high !== undefined && value > r.high) return "high";
  return "normal";
}

export function statusLabel(status: BloodStatus): string {
  switch (status) {
    case "low": return "Low";
    case "high": return "High";
    case "normal": return "Normal";
    default: return "Not tested";
  }
}
