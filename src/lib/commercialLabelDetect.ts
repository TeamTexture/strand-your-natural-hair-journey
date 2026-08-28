// Detects a SCANNED COMMERCIAL INGREDIENT LIST that is about to be filed as a
// homemade recipe.
//
// This is the mechanism behind a real support case: a member photographed the
// back of a shop-bought leave-in and saved it through the DIY flow. Everything
// downstream then reasoned about it as a kitchen mix — concentration-aware DIY
// safety, unpreserved-spoilage logic, a "lower confidence" subset that read like
// the whole recipe. The list itself gives it away: a full manufactured
// preservative system, no measured amounts anywhere, and far more lines than a
// kitchen recipe ever has.
//
// Purely a PROMPT — she always decides. Never reclassifies anything silently.

export interface CommercialLabelSignals {
  looksCommercial: boolean;
  /** Preservative names found on the list, as written. */
  preservatives: string[];
  ingredientCount: number;
  anyAmounts: boolean;
}

/** Preservatives that essentially only appear in manufactured formulations. */
const PRESERVATIVE_RX =
  /\b(phenoxyethanol|potassium sorbate|sodium benzoate|benzyl alcohol|dehydroacetic acid|chlorphenesin|ethylhexylglycerin|caprylhydroxamic acid|methylisothiazolinone|methylchloroisothiazolinone|dmdm hydantoin|diazolidinyl urea|imidazolidinyl urea|iodopropynyl butylcarbamate|sodium hydroxymethylglycinate|paraben)\b/i;

/** INCI-only vocabulary: nobody writes these on a kitchen notecard. */
const INCI_MARKER_RX =
  /\b(aqua|parfum|behentrimonium|cetearyl|cetrimonium|steareth|polyquaternium|quaternium|dimethicone|amodimethicone|peg-\d|disodium edta|tetrasodium|carbomer|phenyl trimethicone|glyceryl stearate|stearamidopropyl|cocamidopropyl|sodium laureth|hydroxyethylcellulose|citric acid)\b/i;

export function detectCommercialLabel(
  items: Array<{ ingredient: string; amount?: string }>,
): CommercialLabelSignals {
  const named = items.filter((i) => i.ingredient.trim().length > 0);
  const preservatives = [
    ...new Set(
      named
        .map((i) => i.ingredient.trim())
        .filter((n) => PRESERVATIVE_RX.test(n)),
    ),
  ];
  const anyAmounts = named.some((i) => (i.amount ?? "").trim().length > 0);
  const inciMarkers = named.filter((i) => INCI_MARKER_RX.test(i.ingredient)).length;
  const count = named.length;

  // No amounts anywhere is the shared precondition: a recipe she actually mixed
  // almost always carries at least one measure.
  const looksCommercial = !anyAmounts && count >= 8 && (
    preservatives.length >= 1 || inciMarkers >= 3 || count >= 18
  );

  return { looksCommercial, preservatives, ingredientCount: count, anyAmounts };
}
