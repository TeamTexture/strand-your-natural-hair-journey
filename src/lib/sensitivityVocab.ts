// Allergy & sensitivity vocabulary — one shared source for the capture chips,
// the "avoiding" summaries and the client-side topical matcher.
//
// Special-category health data: entries are stored ENCRYPTED (bytea) in
// `public.user_sensitivities.entries_enc`. Nothing here is queried in SQL —
// all matching runs over decrypted plaintext, in memory (client for topical
// warnings, edge function for nutrition validation).

export type SensitivityScope = "topical" | "dietary";

/** Three levels, never a checkbox. Only "avoid" is a hard exclusion. */
export type SensitivitySeverity = "avoid" | "limit" | "dislike";

export interface SensitivityEntry {
  /** Canonical vocabulary code, or null for free text. */
  code: string | null;
  label: string;
  severity: SensitivitySeverity;
  custom?: boolean;
}

export const SEVERITY_LABEL: Record<SensitivitySeverity, string> = {
  avoid: "Avoid completely",
  limit: "Limit",
  dislike: "Dislike",
};

export const SEVERITY_SHORT: Record<SensitivitySeverity, string> = {
  avoid: "Avoid",
  limit: "Limit",
  dislike: "Dislike",
};

export interface VocabItem {
  code: string;
  label: string;
  /** Lower-cased match terms, including aliases. */
  aliases: string[];
}

// ─────────────── Dietary: the 14 UK regulated allergens ───────────────

export const DIETARY_VOCAB: VocabItem[] = [
  {
    code: "gluten",
    label: "Cereals containing gluten",
    aliases: [
      "gluten", "wheat", "barley", "rye", "oats", "spelt", "kamut", "semolina",
      "durum", "couscous", "bulgur", "farro", "seitan", "bread", "pasta",
      "flour", "breadcrumbs", "pastry", "malt",
    ],
  },
  {
    code: "crustaceans",
    label: "Crustaceans",
    aliases: ["crustacean", "prawn", "prawns", "shrimp", "crab", "lobster", "langoustine", "crayfish", "scampi"],
  },
  { code: "eggs", label: "Eggs", aliases: ["egg", "eggs", "albumen", "mayonnaise", "meringue", "omelette", "frittata"] },
  {
    code: "fish",
    label: "Fish",
    aliases: ["fish", "salmon", "mackerel", "sardine", "sardines", "tuna", "cod", "haddock", "anchovy", "anchovies", "trout", "herring", "kipper", "worcestershire sauce", "fish sauce"],
  },
  { code: "peanuts", label: "Peanuts", aliases: ["peanut", "peanuts", "groundnut", "groundnuts", "peanut butter", "satay", "arachis"] },
  {
    code: "soya",
    label: "Soya",
    aliases: ["soya", "soy", "soybean", "soya bean", "tofu", "tempeh", "edamame", "miso", "soy sauce", "tamari", "textured vegetable protein", "tvp", "soya lecithin"],
  },
  {
    code: "milk",
    label: "Milk (dairy)",
    aliases: ["milk", "dairy", "cheese", "butter", "ghee", "yoghurt", "yogurt", "cream", "whey", "casein", "caseinate", "lactose", "custard", "kefir", "paneer", "condensed milk", "evaporated milk"],
  },
  {
    code: "tree_nuts",
    label: "Tree nuts",
    aliases: ["tree nut", "tree nuts", "almond", "almonds", "hazelnut", "walnut", "walnuts", "cashew", "cashews", "pecan", "pistachio", "brazil nut", "macadamia", "marzipan", "praline", "nut butter", "frangipane"],
  },
  { code: "celery", label: "Celery", aliases: ["celery", "celeriac", "celery salt", "celery seed"] },
  { code: "mustard", label: "Mustard", aliases: ["mustard", "mustard seed", "dijon", "wholegrain mustard"] },
  { code: "sesame", label: "Sesame", aliases: ["sesame", "tahini", "sesame oil", "halva", "hummus", "houmous", "za'atar", "gomasio"] },
  { code: "sulphites", label: "Sulphur dioxide / sulphites", aliases: ["sulphite", "sulphites", "sulfite", "sulfites", "sulphur dioxide", "sulfur dioxide", "e220", "e221", "e222", "e223", "e224", "e226", "e227", "e228"] },
  { code: "lupin", label: "Lupin", aliases: ["lupin", "lupine", "lupin flour"] },
  { code: "molluscs", label: "Molluscs", aliases: ["mollusc", "molluscs", "mussel", "mussels", "oyster", "oysters", "squid", "calamari", "octopus", "clam", "clams", "scallop", "scallops", "snail", "whelk"] },
];

// ─────────────── Topical: reused from the ingredient avoid logic ───────────────
// Vocabulary lifted from the existing flag rules in
// `_shared/ingredient-copy.ts` / `ingredient-analysis` / `ingredient-explainer`
// so the chips and the analysis speak the same language. No new terms.

export const TOPICAL_VOCAB: VocabItem[] = [
  {
    code: "sulphates",
    label: "Sulphates (SLS / SLES)",
    aliases: ["sulphate", "sulfate", "sodium lauryl sulfate", "sodium laureth sulfate", "sls", "sles", "ammonium lauryl sulfate", "sodium coco sulfate"],
  },
  {
    code: "drying_alcohols",
    label: "Drying alcohols",
    aliases: ["alcohol denat", "denatured alcohol", "sd alcohol", "isopropyl alcohol", "isopropanol", "ethanol", "propanol"],
  },
  {
    code: "fragrance",
    label: "Fragrance / parfum",
    aliases: ["fragrance", "parfum", "perfume", "aroma", "linalool", "limonene", "citronellol", "geraniol", "eugenol", "coumarin"],
  },
  {
    code: "mi_preservatives",
    label: "Methylisothiazolinone & related preservatives",
    aliases: ["methylisothiazolinone", "methylchloroisothiazolinone", "mci", "benzisothiazolinone", "formaldehyde", "dmdm hydantoin", "imidazolidinyl urea", "diazolidinyl urea", "quaternium-15"],
  },
  { code: "parabens", label: "Parabens", aliases: ["paraben", "methylparaben", "propylparaben", "butylparaben", "ethylparaben"] },
  { code: "colourants", label: "Colourants / dyes", aliases: ["ci 1", "ci 2", "ci 4", "ci 6", "ci 7", "colourant", "colorant", "fd&c", "d&c", "ppd", "p-phenylenediamine", "resorcinol"] },
  { code: "silicones", label: "Silicones", aliases: ["dimethicone", "cyclopentasiloxane", "amodimethicone", "cyclomethicone", "trimethicone", "siloxane", "silicone"] },
  { code: "protein", label: "Protein (hydrolysed protein)", aliases: ["hydrolyzed protein", "hydrolysed protein", "hydrolyzed wheat protein", "keratin", "collagen", "silk amino", "soy protein", "wheat protein", "rice protein"] },
  { code: "essential_oils", label: "Essential oils", aliases: ["essential oil", "tea tree", "melaleuca", "peppermint oil", "mentha", "eucalyptus", "rosemary oil", "lavender oil", "clove oil", "cinnamon oil", "citrus oil"] },
  { code: "lanolin", label: "Lanolin", aliases: ["lanolin", "wool wax", "lanolin alcohol"] },
  { code: "coconut", label: "Coconut", aliases: ["coconut", "cocos nucifera", "coco", "cocamidopropyl betaine", "coco-glucoside", "cocamide"] },
  { code: "shea", label: "Shea butter", aliases: ["shea", "butyrospermum", "shea butter"] },
  { code: "mineral_oil", label: "Mineral oil / petrolatum", aliases: ["mineral oil", "petrolatum", "paraffinum liquidum", "petroleum jelly"] },
  { code: "propylene_glycol", label: "Propylene glycol", aliases: ["propylene glycol", "butylene glycol"] },
  { code: "nut_oils", label: "Nut oils", aliases: ["almond oil", "prunus amygdalus", "macadamia oil", "argan", "walnut oil", "hazelnut oil", "peanut oil", "arachis oil"] },
];

export function vocabFor(scope: SensitivityScope): VocabItem[] {
  return scope === "dietary" ? DIETARY_VOCAB : TOPICAL_VOCAB;
}

export function vocabItem(scope: SensitivityScope, code: string): VocabItem | undefined {
  return vocabFor(scope).find((v) => v.code === code);
}

export function labelForCode(scope: SensitivityScope, code: string): string {
  return vocabItem(scope, code)?.label ?? code;
}

/** Codes that exist in BOTH vocabularies — offered as "applies to food too". */
export const CROSS_SCOPE_CODES = ["soya", "coconut", "sesame", "tree_nuts", "peanuts", "gluten", "protein"];

export const CONFIRM_COLUMN: Record<SensitivityScope, "topical_sensitivities_confirmed_at" | "dietary_sensitivities_confirmed_at"> = {
  topical: "topical_sensitivities_confirmed_at",
  dietary: "dietary_sensitivities_confirmed_at",
};

/** Hard exclusions only. */
export function hardAvoid(entries: SensitivityEntry[]): SensitivityEntry[] {
  return entries.filter((e) => e.severity === "avoid");
}

/** Match terms for one entry: its own label plus every alias of its code. */
export function matchTermsFor(scope: SensitivityScope, entry: SensitivityEntry): string[] {
  const terms = new Set<string>();
  const label = entry.label?.trim().toLowerCase();
  if (label) terms.add(label);
  if (entry.code) {
    const item = vocabItem(scope, entry.code);
    for (const a of item?.aliases ?? []) terms.add(a.toLowerCase());
    if (item) terms.add(item.label.toLowerCase());
  }
  return [...terms].filter((t) => t.length >= 3);
}
