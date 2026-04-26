// Curated list of ingredients that should trigger RAG retrieval against the
// How To Love Your Afro manuscript. This list is curated to surface RAG
// passages where Paige has specific, nuanced clinical guidance — it is NOT a
// comprehensive ingredient blocklist or an avoid-list. Matching is a
// case-insensitive substring check, so e.g. "Hydrolyzed Wheat Protein" in
// the user payload matches "hydrolyzed protein" in this list.
//
// RAG also triggers (independently of this list) when any ingredient in the
// product appears in the user's personal avoid_ingredients list. See
// shouldTriggerRag() below for the combined predicate.

export const RAG_TRIGGER_INGREDIENTS: string[] = [
  // Hair-loss and scalp actives
  "peptide", // copper peptides, signal peptides, biotinyl tripeptide, etc.
  "minoxidil",
  "retinol",
  "retinoid",
  "retinoic",
  "salicylic acid",
  "aha",
  "bha",
  "glycolic acid",
  "lactic acid",
  "mandelic acid",
  "hyaluronic acid",
  "niacinamide",
  "caffeine", // scalp products specifically
  // Antifungal scalp actives
  "ketoconazole",
  "piroctone olamine",
  "zinc pyrithione",
  // Barrier / porosity
  "ceramide",
  "phytoceramide",
  "hydrolyzed protein", // matches keratin/silk/wheat/soy/quinoa/rice when prefixed "hydrolyzed"
  "hydrolyzed keratin",
  "hydrolyzed silk",
  "hydrolyzed wheat",
  "hydrolyzed soy",
  "hydrolyzed quinoa",
  "hydrolyzed rice",
  // Cationic surfactants worth specific guidance
  "behentrimonium methosulfate",
  "cetrimonium chloride",
  // Sulfates — context-dependent (only matters when scalp is dry/sensitive)
  "sodium lauryl sulfate",
  "sodium laureth sulfate",
  // Heritage-relevant naturals with porosity / clinical edge cases
  "coconut oil",
  "castor oil",
  "jamaican black castor oil",
  "shea butter",
  // Chelators — relevant in hard-water postcodes
  "edta",
  "phytic acid",
  "citric acid",
  // Bond builders / chemical-history dependent
  "olaplex",
  "bond builder",
  "henna",
  // Relaxers — listed for completeness (rare in product analysis input)
  "ammonium thioglycolate",
  "sodium hydroxide",
];

/** Case-insensitive substring match — returns the matched trigger token (or null). */
export function matchTriggerIngredient(name: string): string | null {
  const n = name.toLowerCase();
  for (const t of RAG_TRIGGER_INGREDIENTS) {
    if (n.includes(t)) return t;
  }
  return null;
}

/** Combined predicate: returns true if RAG should be invoked for this product. */
export function shouldTriggerRag(
  ingredients: string[],
  userAvoidList: string[] = [],
): boolean {
  const avoid = new Set(userAvoidList.map((s) => s.toLowerCase().trim()));
  for (const ing of ingredients) {
    const lower = ing.toLowerCase().trim();
    if (avoid.has(lower)) return true;
    if (matchTriggerIngredient(lower)) return true;
  }
  return false;
}
