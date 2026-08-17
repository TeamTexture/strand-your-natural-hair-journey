// Allergen / irritant alias map — CODE, not data.
//
// Mirrors src/lib/sensitivityVocab.ts (edge functions cannot import from src/).
// Because the map lives in code, it can be extended without re-encrypting a
// single stored row.

export type SensitivityScope = "topical" | "dietary";
export type SensitivitySeverity = "avoid" | "limit" | "dislike";

export interface SensitivityEntry {
  code: string | null;
  label: string;
  severity: SensitivitySeverity;
  custom?: boolean;
}

export const DIETARY_ALIASES: Record<string, string[]> = {
  gluten: ["gluten", "wheat", "barley", "rye", "oats", "spelt", "kamut", "semolina", "durum", "couscous", "bulgur", "farro", "seitan", "bread", "pasta", "flour", "breadcrumbs", "pastry", "malt"],
  crustaceans: ["crustacean", "prawn", "prawns", "shrimp", "crab", "lobster", "langoustine", "crayfish", "scampi"],
  eggs: ["egg", "eggs", "albumen", "mayonnaise", "meringue", "omelette", "frittata"],
  fish: ["fish", "salmon", "mackerel", "sardine", "sardines", "tuna", "cod", "haddock", "anchovy", "anchovies", "trout", "herring", "kipper", "worcestershire sauce", "fish sauce"],
  peanuts: ["peanut", "peanuts", "groundnut", "groundnuts", "peanut butter", "satay", "arachis"],
  soya: ["soya", "soy", "soybean", "soya bean", "tofu", "tempeh", "edamame", "miso", "soy sauce", "tamari", "textured vegetable protein", "tvp", "soya lecithin"],
  milk: ["milk", "dairy", "cheese", "butter", "ghee", "yoghurt", "yogurt", "cream", "whey", "casein", "caseinate", "lactose", "custard", "kefir", "paneer", "condensed milk", "evaporated milk"],
  tree_nuts: ["tree nut", "tree nuts", "almond", "almonds", "hazelnut", "walnut", "walnuts", "cashew", "cashews", "pecan", "pistachio", "brazil nut", "macadamia", "marzipan", "praline", "nut butter", "frangipane"],
  celery: ["celery", "celeriac", "celery salt", "celery seed"],
  mustard: ["mustard", "mustard seed", "dijon", "wholegrain mustard"],
  sesame: ["sesame", "tahini", "sesame oil", "halva", "hummus", "houmous", "za'atar", "gomasio"],
  sulphites: ["sulphite", "sulphites", "sulfite", "sulfites", "sulphur dioxide", "sulfur dioxide"],
  lupin: ["lupin", "lupine", "lupin flour"],
  molluscs: ["mollusc", "molluscs", "mussel", "mussels", "oyster", "oysters", "squid", "calamari", "octopus", "clam", "clams", "scallop", "scallops", "snail", "whelk"],
};

export const DIETARY_LABELS: Record<string, string> = {
  gluten: "Cereals containing gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  peanuts: "Peanuts",
  soya: "Soya",
  milk: "Milk (dairy)",
  tree_nuts: "Tree nuts",
  celery: "Celery",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphur dioxide / sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
};

export const TOPICAL_ALIASES: Record<string, string[]> = {
  sulphates: ["sulphate", "sulfate", "sodium lauryl sulfate", "sodium laureth sulfate", "sls", "sles"],
  drying_alcohols: ["alcohol denat", "denatured alcohol", "sd alcohol", "isopropyl alcohol", "isopropanol", "ethanol"],
  fragrance: ["fragrance", "parfum", "perfume", "linalool", "limonene", "citronellol", "geraniol", "eugenol", "coumarin"],
  mi_preservatives: ["methylisothiazolinone", "methylchloroisothiazolinone", "benzisothiazolinone", "formaldehyde", "dmdm hydantoin", "imidazolidinyl urea", "diazolidinyl urea", "quaternium-15"],
  parabens: ["paraben", "methylparaben", "propylparaben", "butylparaben", "ethylparaben"],
  colourants: ["colourant", "colorant", "ppd", "p-phenylenediamine", "resorcinol"],
  silicones: ["dimethicone", "cyclopentasiloxane", "amodimethicone", "cyclomethicone", "siloxane", "silicone"],
  protein: ["hydrolyzed protein", "hydrolysed protein", "hydrolyzed wheat protein", "keratin", "collagen", "silk amino", "soy protein", "wheat protein", "rice protein"],
  essential_oils: ["essential oil", "tea tree", "melaleuca", "peppermint oil", "mentha", "eucalyptus", "rosemary oil", "lavender oil", "clove oil", "cinnamon oil"],
  lanolin: ["lanolin", "wool wax", "lanolin alcohol"],
  coconut: ["coconut", "cocos nucifera", "cocamidopropyl betaine", "coco-glucoside", "cocamide"],
  shea: ["shea", "butyrospermum", "shea butter"],
  mineral_oil: ["mineral oil", "petrolatum", "paraffinum liquidum", "petroleum jelly"],
  propylene_glycol: ["propylene glycol", "butylene glycol"],
  nut_oils: ["almond oil", "prunus amygdalus", "macadamia oil", "argan", "walnut oil", "hazelnut oil", "peanut oil", "arachis oil"],
};

export function aliasesFor(scope: SensitivityScope, code: string): string[] {
  const map = scope === "dietary" ? DIETARY_ALIASES : TOPICAL_ALIASES;
  return map[code] ?? [];
}

/** Every match term for one entry: its label plus its code's aliases. */
export function matchTermsFor(
  scope: SensitivityScope,
  entry: SensitivityEntry,
): string[] {
  const terms = new Set<string>();
  const label = (entry.label ?? "").trim().toLowerCase();
  if (label) terms.add(label);
  if (entry.code) {
    for (const a of aliasesFor(scope, entry.code)) terms.add(a.toLowerCase());
    const canon = scope === "dietary" ? DIETARY_LABELS[entry.code] : undefined;
    if (canon) terms.add(canon.toLowerCase());
  }
  return [...terms].filter((t) => t.length >= 3);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function containsTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, "i").test(
    haystack,
  );
}

export interface ScanHit {
  label: string;
  code: string | null;
  term: string;
}

/**
 * Deterministic scan of generated text against the member's hard exclusions.
 * `entries` should already be filtered to severity === "avoid".
 */
export function scanText(
  text: string,
  entries: SensitivityEntry[],
  scope: SensitivityScope,
): ScanHit[] {
  if (!text || entries.length === 0) return [];
  const haystack = text.toLowerCase();
  const hits: ScanHit[] = [];
  for (const entry of entries) {
    const term = matchTermsFor(scope, entry).find((t) =>
      containsTerm(haystack, t)
    );
    if (term) hits.push({ label: entry.label, code: entry.code ?? null, term });
  }
  return hits;
}
