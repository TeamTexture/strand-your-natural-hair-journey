// Targeted manuscript retrieval query for the two product scan surfaces.
//
// PAYLOAD/GROUNDING (2026-09-04). Both scan functions used to retrieve with the
// SAME fixed keyword string on every call:
//
//   "product ingredients Afro hair porosity scalp moisture protein sulfate
//    silicone oils butters <first 200 chars of hairProfile JSON>"      (photo)
//   "…same string… <the raw URL>"                                       (link)
//
// Every scan therefore competed for the same four passages, the raw URL added
// pure noise to the embedding, and the member's own recorded signals were
// truncated at 200 characters of raw JSON.
//
// This module builds the query from (a) THIS member's recorded hair signals and
// (b) THIS product's own ingredient and claim vocabulary, so the same four
// passages are chosen for relevance rather than by a constant. The number of
// retrieved passages is UNCHANGED — the grounding is not thinned, it is aimed.
// Nothing here fabricates advice: it only decides which manuscript passages the
// writer is allowed to reason from.

/** Terminology that actually earns retrieval weight — real hair-science nouns
 *  the manuscript uses. Never hair typing terminology (no 3C/4C/type 4). */
const IN_SCOPE_TERMS = [
  "porosity",
  "elasticity",
  "density",
  "strand width",
  "shrinkage",
  "breakage",
  "shedding",
  "scalp",
  "sebum",
  "dandruff",
  "flaking",
  "itch",
  "protein",
  "moisture",
  "humectant",
  "emollient",
  "surfactant",
  "sulfate",
  "silicone",
  "oil",
  "butter",
  "gel",
  "leave-in",
  "heat",
  "colour",
  "relaxer",
  "protective style",
  "braids",
  "cornrows",
  "twists",
  "wash day",
  "detangling",
  "length retention",
  "edges",
  "hairline",
  "crown",
  "nape",
  "thinning",
];

const STOP = new Set([
  "and", "the", "for", "with", "your", "you", "not", "any", "all", "from",
  "this", "that", "have", "has", "www", "http", "https", "html", "com",
  "product", "products", "hair", "haircare",
]);

function pushUnique(out: string[], value: unknown) {
  if (typeof value !== "string") return;
  const v = value.trim().toLowerCase();
  if (!v || v.length < 3 || STOP.has(v)) return;
  if (!out.includes(v)) out.push(v);
}

/** Recorded member signals, in the order they matter for grounding: the areas
 *  she flagged, then her challenges and goal, then durable characteristics. */
export function memberRetrievalSignals(
  context: Record<string, unknown> | undefined,
): string[] {
  const out: string[] = [];
  const ctx = (context ?? {}) as Record<string, unknown>;
  const hair = (ctx.hairProfile ?? {}) as Record<string, unknown>;

  const areas = hair.areas_of_concern;
  if (Array.isArray(areas)) areas.forEach((a) => pushUnique(out, a));

  const goals = Array.isArray(ctx.goals) ? (ctx.goals as Record<string, unknown>[]) : [];
  for (const g of goals) {
    pushUnique(out, g.title);
    const ch = g.challenges;
    if (Array.isArray(ch)) ch.forEach((c) => pushUnique(out, c));
  }
  const currentGoal = (ctx.currentGoal ?? {}) as Record<string, unknown>;
  pushUnique(out, currentGoal.title);
  if (Array.isArray(currentGoal.challenges)) {
    (currentGoal.challenges as unknown[]).forEach((c) => pushUnique(out, c));
  }

  for (
    const key of [
      "porosity",
      "texture",
      "strand_width",
      "density",
      "scalp_condition",
      "length",
      "chemical_history",
      "heat_use",
    ]
  ) pushUnique(out, hair[key]);

  const style = (ctx.currentStyle ?? {}) as Record<string, unknown>;
  pushUnique(out, style.current_hairstyle ?? style.default_style);

  return out;
}

/** Product-side vocabulary: the ingredient and claim words the manuscript
 *  actually has passages about. Anything unrecognised is dropped rather than
 *  fed to the embedding as noise. */
export function productRetrievalSignals(input: {
  ingredients?: unknown;
  productName?: string | null;
  brand?: string | null;
  category?: string | null;
  pageText?: string | null;
}): string[] {
  const out: string[] = [];
  pushUnique(out, input.category);

  const haystack = [
    Array.isArray(input.ingredients) ? (input.ingredients as unknown[]).join(" ") : "",
    typeof input.ingredients === "string" ? input.ingredients : "",
    input.productName ?? "",
    input.pageText ? String(input.pageText).slice(0, 6000) : "",
  ].join(" ").toLowerCase();

  if (haystack.trim()) {
    for (const term of IN_SCOPE_TERMS) {
      if (haystack.includes(term)) pushUnique(out, term);
    }
  }
  return out;
}

/**
 * The retrieval query for a scan. Falls back to the member's signals alone when
 * the product is not yet known (a photo scan reads the label INSIDE the model
 * call, so no ingredient list exists at retrieval time), and to the in-scope
 * terminology when a brand-new member has nothing on record — retrieval must
 * never come back empty, because an ungrounded generation is not acceptable.
 */
export function scanRetrievalQuery(input: {
  context?: Record<string, unknown>;
  ingredients?: unknown;
  productName?: string | null;
  brand?: string | null;
  category?: string | null;
  pageText?: string | null;
}): string {
  const member = memberRetrievalSignals(input.context);
  const product = productRetrievalSignals(input);
  const terms = [...product, ...member].slice(0, 40);
  if (terms.length === 0) {
    return `Afro and textured hair product suitability ${
      IN_SCOPE_TERMS.slice(0, 12).join(" ")
    }`;
  }
  return `Afro and textured hair product suitability: ${terms.join(", ")}`;
}
