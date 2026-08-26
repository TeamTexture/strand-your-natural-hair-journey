/** Surfactant classification helpers for the product ingredient detail view. */
export type SurfactantRole = "primary" | "secondary" | "none";

const PRIMARY_SURFACTANTS = [
  "sodium lauryl sulfate", "sodium lauryl sulphate",
  "sodium laureth sulfate", "sodium laureth sulphate",
  "ammonium lauryl sulfate", "ammonium laureth sulfate",
  "sodium coco-sulfate", "sodium coco sulfate",
  "sodium c14-16 olefin sulfonate",
  "sodium cocoyl isethionate",
  "sodium methyl cocoyl taurate",
  "tea-lauryl sulfate",
];

const SECONDARY_SURFACTANTS = [
  "cocamidopropyl betaine",
  "coco-glucoside", "coco glucoside",
  "decyl glucoside",
  "lauryl glucoside",
  "caprylyl/capryl glucoside",
  "sodium cocoamphoacetate",
  "disodium cocoamphodiacetate",
  "cocamide mea", "cocamide dea",
  "lauramidopropyl betaine",
  "sodium lauroyl sarcosinate",
];

/** Fallback classifier for cached analyses saved before the AI returned
 *  `surfactant_role`. Name-based, deliberately conservative. */
export function classifySurfactant(name: string): SurfactantRole {
  const n = name.toLowerCase().trim();
  if (PRIMARY_SURFACTANTS.some((s) => n.includes(s))) return "primary";
  if (SECONDARY_SURFACTANTS.some((s) => n.includes(s))) return "secondary";
  return "none";
}

export const SURFACTANT_ROLE_LABEL: Record<Exclude<SurfactantRole, "none">, string> = {
  primary: "Primary surfactant",
  secondary: "Secondary surfactant",
};

export const SURFACTANT_ROLE_NOTE: Record<Exclude<SurfactantRole, "none">, string> = {
  primary:
    "This is the main cleanser doing most of the work. Brands don't publish exact percentages, so how strong it is here is judged from what the product is sold to do.",
  secondary:
    "This is a support cleanser — it builds lather and softens the main cleanser. Exact percentages aren't published, so this is judged from the product's stated purpose.",
};
