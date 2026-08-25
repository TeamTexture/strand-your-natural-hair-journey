import { describe, it, expect } from "vitest";
import {
  groupProductsByCategory,
  categoryOrderForStep,
  normaliseProductCategory,
  PRODUCT_CATEGORY_ORDER,
} from "@/lib/productCategories";
import type { UserProduct } from "@/hooks/useUserProducts";

// The real category spread of an audit member's 30-product shelf, including the
// 3 rows with a null category. Sectioning must never lose one of these.
const CATEGORIES: (string | null)[] = [
  "shampoo", "shampoo", "shampoo",
  "conditioner", "conditioner", "conditioner", "conditioner",
  "mask", "mask",
  "treatment", "treatment", "treatment",
  "leave-in", "leave-in", "leave-in", "leave-in", "leave-in",
  "styler", "styler", "styler", "styler",
  "oil", "oil", "oil",
  "other", "other", "other",
  null, null, null,
];

const shelf = CATEGORIES.map((category, i) => ({
  id: `p${i}`,
  name: `Product ${i}`,
  category,
})) as unknown as UserProduct[];

describe("groupProductsByCategory", () => {
  it("keeps every product, including null categories", () => {
    const sections = groupProductsByCategory(shelf);
    const visible = sections.reduce((n, s) => n + s.products.length, 0);
    expect(visible).toBe(shelf.length);
    // null → Other, so Other holds its own 3 plus the 3 nulls
    expect(sections.find((s) => s.slug === "other")?.products).toHaveLength(6);
  });

  it("never renders an empty section", () => {
    const sections = groupProductsByCategory([shelf[0]]);
    expect(sections.map((s) => s.slug)).toEqual(["shampoo"]);
  });

  it("uses canonical order with no step hint", () => {
    const sections = groupProductsByCategory(shelf);
    expect(sections.map((s) => s.slug)).toEqual([...PRODUCT_CATEGORY_ORDER]);
  });

  it("hoists the step's categories but keeps all of them reachable", () => {
    const sections = groupProductsByCategory(shelf, "cleanse");
    expect(sections[0].slug).toBe("shampoo");
    expect(sections).toHaveLength(PRODUCT_CATEGORY_ORDER.length);
    const order = categoryOrderForStep("cleanse");
    expect([...order].sort()).toEqual([...PRODUCT_CATEGORY_ORDER].sort());
  });

  it("normalises unknown and legacy spellings to Other, not a new bucket", () => {
    expect(normaliseProductCategory("leave_in")).toBe("other");
    expect(normaliseProductCategory("Leave-In")).toBe("leave-in");
    expect(normaliseProductCategory(null)).toBe("other");
  });
});
