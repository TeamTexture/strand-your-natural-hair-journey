// Health profile option sets — the single source of truth.
//
// These lists were previously declared twice (onboarding ProfileStep2 and the
// profile-review HealthFieldsSection) and drifted. Everything reads from here
// now, the same way `src/lib/dietaryPattern.ts` owns the dietary set.
//
// "Eating disorder" is deliberately NOT collected. Because we do not hold that
// signal, all nutrition guidance is additive and food-positive by default —
// see the nutrition safety block in `src/lib/dietaryPattern.ts`.

export const LIFE_STAGE_OPTIONS = [
  "Pregnant",
  "Postpartum",
  "Perimenopause",
  "Menopause",
  "None currently",
] as const;

export const CONTRACEPTION_OPTIONS = [
  "Hormonal pill",
  "IUD hormonal",
  "Implant",
  "HRT",
  "Fertility treatment",
  "None non-hormonal",
] as const;

/** The affirmative "nothing applies" answer for the multi-select condition list. */
export const CONDITIONS_NONE = "None";

export const CONDITIONS_OPTIONS = [
  "Thyroid condition",
  "PCOS",
  "Anaemia",
  "Diabetes",
  "Lupus",
  "Coeliac",
  "Psoriasis",
  "Eczema",
  "Chronic stress / anxiety",
  "Alopecia",
  "Cancer / chemo",
  CONDITIONS_NONE,
] as const;

export const DIET_BALANCE_OPTIONS = [
  "Very varied",
  "Fairly balanced",
  "Limited / restricted",
] as const;

export const SMOKE_OPTIONS = ["No", "Occasionally", "Regularly", "Ex-smoker"] as const;

export const ALCOHOL_OPTIONS = ["None", "Light social", "Moderate", "Heavy"] as const;

export const WATER_OPTIONS = ["Under 1 litre", "1-2 litres", "2+ litres"] as const;

export const EXERCISE_OPTIONS = [
  "Rarely",
  "1-3x per week",
  "4-5x per week",
  "Daily",
] as const;

export const SLEEP_OPTIONS = ["Poor", "Average", "Good"] as const;

/**
 * Multi-select toggle where "None" is affirmative and mutually exclusive with
 * every other condition. An empty array is not a valid answer — the member has
 * to actively say either what applies or that nothing does.
 */
export function toggleCondition(current: string[], option: string): string[] {
  if (option === CONDITIONS_NONE) {
    return current.includes(CONDITIONS_NONE) ? [] : [CONDITIONS_NONE];
  }
  const withoutNone = current.filter((v) => v !== CONDITIONS_NONE);
  return withoutNone.includes(option)
    ? withoutNone.filter((v) => v !== option)
    : [...withoutNone, option];
}
