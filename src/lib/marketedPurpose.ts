/** Marketed purpose — the hair need a product is SOLD for.
 *  Mirrors the `product_marketed_purpose` enum in the database and the
 *  `marketed_purpose` field returned by the product-analyse functions. */
export type MarketedPurpose =
  | "dry_hair"
  | "damaged_hair"
  | "colour_treated"
  | "greasy_oily"
  | "general_all_hair_types"
  | "moisture"
  | "repair"
  | "clarifying"
  | "density_growth"
  | "scalp_health";

export const MARKETED_PURPOSES: MarketedPurpose[] = [
  "dry_hair",
  "damaged_hair",
  "colour_treated",
  "greasy_oily",
  "general_all_hair_types",
  "moisture",
  "repair",
  "clarifying",
  "density_growth",
  "scalp_health",
];

export const MARKETED_PURPOSE_LABEL: Record<MarketedPurpose, string> = {
  dry_hair: "Dry hair",
  damaged_hair: "Damaged hair",
  colour_treated: "Colour treated",
  greasy_oily: "Greasy / oily hair",
  general_all_hair_types: "All hair types",
  moisture: "Moisture",
  repair: "Repair",
  clarifying: "Clarifying",
  density_growth: "Density & growth",
  scalp_health: "Scalp health",
};

/** Plain-English note on what the stated purpose implies about cleansing
 *  strength. Percentages are never published, so this is always framed as
 *  guidance based on what the product is sold to do. */
export const MARKETED_PURPOSE_SURFACTANT_NOTE: Record<MarketedPurpose, string> = {
  dry_hair: "Sold for dry hair, so the main cleanser is usually dialled down and softened with gentler co-surfactants.",
  damaged_hair: "Sold for damaged hair, so expect a gentler main cleanser and more conditioning agents.",
  colour_treated: "Sold for colour-treated hair, so the main cleanser is usually mild to protect the colour.",
  greasy_oily: "Sold for greasy or oily hair, so expect a stronger main cleanser — follow it with proper conditioning.",
  general_all_hair_types: "Sold for all hair types, so cleansing strength is likely middle-of-the-road.",
  moisture: "Sold as a moisture product, so the main cleanser is usually mild and paired with softening agents.",
  repair: "Sold as a repair product, so expect a gentler cleansing base alongside strengthening ingredients.",
  clarifying: "Sold as clarifying, so the main cleanser is strong by design — always follow with intensive conditioning.",
  density_growth: "Sold for density, thickness or growth, so expect a scalp-focused formula — the cleansing base is usually moderate and the active work happens at the root.",
  scalp_health: "Sold for scalp health, so expect scalp-targeted actives with a moderate cleansing base — the lengths still need their own conditioning.",
};

export const isMarketedPurpose = (v: unknown): v is MarketedPurpose =>
  typeof v === "string" && (MARKETED_PURPOSES as string[]).includes(v);

/** Best-effort inference from the product name / description, used as the
 *  pre-selected value when the AI didn't return one. */
export function inferMarketedPurpose(text: string | null | undefined): MarketedPurpose | null {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (/densit|thick|thinning|fuller|volumis|volumiz|growth|grow(th)?[ -]?serum|hair fall|shedding|regrow/.test(t)) return "density_growth";
  if (/scalp|dandruff|flake|itch|sebum balance|folliclе|follicle/.test(t)) return "scalp_health";
  if (/clarif|chelat|detox|purif|deep clean|build[- ]?up/.test(t)) return "clarifying";
  if (/oily|greasy|grease|sebum|balanc(e|ing) scalp/.test(t)) return "greasy_oily";
  if (/colour|color|dyed|highlight|toning|blonde/.test(t)) return "colour_treated";
  if (/repair|bond|reconstruct|protein|strength/.test(t)) return "repair";
  if (/damag|breakage|brittle|split end/.test(t)) return "damaged_hair";
  if (/hydrat|moistur|quench|thirst/.test(t)) return "moisture";
  if (/dry|parch|dehydrat/.test(t)) return "dry_hair";
  if (/all hair types|everyday|daily/.test(t)) return "general_all_hair_types";
  return null;
}

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
