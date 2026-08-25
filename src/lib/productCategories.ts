// Product category grouping for the "Add products used" picker.
//
// `user_products.category` is free text but only ever holds one of the eight
// canonical slugs below (or null). Anything unrecognised — and null — lands
// under "Other", so a product can never disappear from the picker.
//
// NOTE: the legacy 'leave_in' underscore spelling was merged into 'leave-in'
// in the database. Do not reintroduce it.

import type { UserProduct } from "@/hooks/useUserProducts";

export const PRODUCT_CATEGORY_ORDER = [
  "shampoo",
  "conditioner",
  "mask",
  "treatment",
  "leave-in",
  "styler",
  "oil",
  "other",
] as const;

export type ProductCategorySlug = (typeof PRODUCT_CATEGORY_ORDER)[number];

const LABELS: Record<ProductCategorySlug, string> = {
  shampoo: "Shampoo",
  conditioner: "Conditioner",
  mask: "Mask",
  treatment: "Treatment",
  "leave-in": "Leave-in",
  styler: "Styler",
  oil: "Oil",
  other: "Other",
};

export const productCategoryLabel = (slug: ProductCategorySlug) => LABELS[slug];

/** Normalise a stored category to a canonical slug; null/unknown → "other". */
export function normaliseProductCategory(raw: string | null | undefined): ProductCategorySlug {
  const v = (raw ?? "").trim().toLowerCase();
  return (PRODUCT_CATEGORY_ORDER as readonly string[]).includes(v)
    ? (v as ProductCategorySlug)
    : "other";
}

/**
 * The wash-day step slots are a fixed enum on the wash-day form (not AI
 * wording), so a step can say which categories it most likely needs. Every
 * category still renders — this only moves sections to the top.
 */
export type StepProductHint =
  | "prepoo"
  | "cleanse"
  | "cowash"
  | "condition"
  | "treatment";

const STEP_PRIORITY: Record<StepProductHint, ProductCategorySlug[]> = {
  prepoo: ["oil", "treatment", "mask"],
  cleanse: ["shampoo"],
  cowash: ["conditioner", "shampoo"],
  condition: ["conditioner", "mask", "leave-in"],
  treatment: ["treatment", "mask", "oil"],
};

/** Canonical order, with the step's likely categories hoisted to the front. */
export function categoryOrderForStep(
  hint?: StepProductHint | null,
): ProductCategorySlug[] {
  const priority = hint ? STEP_PRIORITY[hint] ?? [] : [];
  return [
    ...priority,
    ...PRODUCT_CATEGORY_ORDER.filter((c) => !priority.includes(c)),
  ];
}

export interface ProductCategorySection {
  slug: ProductCategorySlug;
  label: string;
  products: UserProduct[];
}

/**
 * Group products into non-empty sections. Ordering follows
 * `categoryOrderForStep`; within a section the incoming order is preserved.
 */
export function groupProductsByCategory(
  products: UserProduct[],
  hint?: StepProductHint | null,
): ProductCategorySection[] {
  const buckets = new Map<ProductCategorySlug, UserProduct[]>();
  for (const p of products) {
    const slug = normaliseProductCategory(
      (p as UserProduct & { category?: string | null }).category,
    );
    const bucket = buckets.get(slug);
    if (bucket) bucket.push(p);
    else buckets.set(slug, [p]);
  }
  return categoryOrderForStep(hint)
    .map((slug) => ({ slug, label: LABELS[slug], products: buckets.get(slug) ?? [] }))
    .filter((s) => s.products.length > 0);
}
