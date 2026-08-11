// Dietary pattern constraints for edge functions.
//
// Mirrors src/lib/dietaryPattern.ts (edge functions cannot import from src/).
// Any nutritional guidance prompt MUST include dietConstraintBlock() so the
// exclusions are stated explicitly instead of inferred by the model.

export type DietaryPattern =
  | "vegan"
  | "vegetarian"
  | "pescatarian"
  | "omnivore"
  | "other"
  | "unknown";

export function canonDiet(v: string | null | undefined): DietaryPattern {
  const l = (v ?? "").trim().toLowerCase();
  if (!l) return "unknown";
  if (l === "vegan") return "vegan";
  if (l === "vegetarian") return "vegetarian";
  if (l === "pescatarian" || l.startsWith("pescat")) return "pescatarian";
  if (l === "omnivore") return "omnivore";
  if (l === "other") return "other";
  return "unknown";
}

export function displayDiet(v: string | null | undefined): string {
  switch (canonDiet(v)) {
    case "vegan": return "Vegan";
    case "vegetarian": return "Vegetarian";
    case "pescatarian": return "Pescatarian";
    case "omnivore": return "Omnivore";
    case "other": return "Other";
    default: return "";
  }
}

export const DIET_EXCLUSIONS: Record<DietaryPattern, string[]> = {
  vegan: [
    "meat", "poultry", "fish", "shellfish", "dairy", "eggs", "honey",
    "gelatine", "collagen from animal sources",
  ],
  vegetarian: ["meat", "poultry", "fish", "shellfish", "gelatine"],
  pescatarian: ["meat", "poultry"],
  omnivore: [],
  other: ["all animal-derived foods, until the member has told us what they avoid"],
  unknown: ["all animal-derived foods, until the member has told us what they avoid"],
};

export const DIET_PERMITTED_NOTES: Record<DietaryPattern, string> = {
  vegan:
    "Plant sources only. Iron and protein must be met with lentils, beans, chickpeas, tofu, tempeh, pumpkin and sesame seeds, dark leafy greens and fortified cereals, paired with a vitamin C food to help absorption. Omega-3 comes from flaxseed, chia, walnuts, hemp seeds and algae.",
  vegetarian:
    "Plant sources plus dairy and eggs. Where guidance would normally point to red meat or liver, give the equivalent plant or dairy-and-egg source instead — never a shorter section.",
  pescatarian:
    "Plant sources plus fish, shellfish, dairy and eggs. Surface fish-based iron and omega-3 sources — sardines, mackerel, salmon, shellfish — because those are available.",
  omnivore: "No restriction.",
  other:
    "We do not yet know what this member avoids, so keep every recommendation plant-based and say that they can tell us what they avoid to get closer guidance.",
  unknown:
    "We do not know this member's dietary pattern, so keep every recommendation plant-based and invite them to record it.",
};

export function dietConstraintBlock(
  diet: string | null | undefined,
  dietOther?: string | null,
): string {
  const d = canonDiet(diet);
  const excluded = DIET_EXCLUSIONS[d];
  const lines = [
    "DIETARY PATTERN — HARD CONSTRAINT, NOT A HINT.",
    `Dietary pattern: ${displayDiet(d) || "not recorded"}.`,
  ];
  if (excluded.length > 0) {
    lines.push(
      `NEVER name, recommend, or use as an example any of these: ${excluded.join(", ")}. Not in a food list, not in a meal, not as an aside, not as "if you eat…".`,
    );
  } else {
    lines.push("No foods are excluded for this member.");
  }
  lines.push(`Available sources: ${DIET_PERMITTED_NOTES[d]}`);
  lines.push(
    "SUBSTITUTE, DO NOT SUBTRACT. If a nutrient would normally be pointed at an excluded food, replace it with a permitted source of the same nutrient. Never return an empty, shorter or thinner section because of the dietary pattern.",
  );
  if ((d === "other" || d === "unknown") && dietOther && dietOther.trim()) {
    lines.push(
      `The member has told us what they avoid, in their own words: "${dietOther.trim()}". Honour this exactly, and you may recommend animal foods that it does not exclude.`,
    );
  }
  return lines.join("\n");
}
