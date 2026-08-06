import { describe, it, expect } from "vitest";
import { resolveAgainstIndex, brandMatchForms, type BrandIndexEntry } from "@/lib/brandProductResolve";

const index: BrandIndexEntry[] = [
  { id: "p1", name: "Hydro Cream Deep Conditioner", brand_name: "Curlsmith", kind: "product", brand_user_id: "b1" },
  { id: "p2", name: "Curl Defining Gel", brand_name: "Curlsmith", kind: "product", brand_user_id: "b1" },
  { id: "t1", name: "Ionic Diffuser", brand_name: "Curlsmith", kind: "tool", brand_user_id: "b1" },
];

describe("brand product resolution", () => {
  it("links on an exact name match", () => {
    const hit = resolveAgainstIndex(
      { name: "Hydro Cream Deep Conditioner", brand: "Curlsmith", kind: "product" },
      index,
    );
    expect(hit?.brand_product_id).toBe("p1");
  });

  it("ignores trademarks, case, punctuation and parentheticals", () => {
    const hit = resolveAgainstIndex(
      { name: "hydro cream™ deep-conditioner (400ml)", brand: "CURLSMITH", kind: "product" },
      index,
    );
    expect(hit?.brand_product_id).toBe("p1");
  });

  it("handles the brand being typed into the product name", () => {
    const hit = resolveAgainstIndex(
      { name: "Curlsmith Curl Defining Gel", brand: "Curlsmith", kind: "product" },
      index,
    );
    expect(hit?.brand_product_id).toBe("p2");
  });

  it("does not link a near miss", () => {
    expect(
      resolveAgainstIndex({ name: "Hydro Cream Leave-In", brand: "Curlsmith", kind: "product" }, index),
    ).toBeNull();
  });

  it("does not link across kinds", () => {
    expect(
      resolveAgainstIndex({ name: "Ionic Diffuser", brand: "Curlsmith", kind: "product" }, index),
    ).toBeNull();
  });

  it("refuses short generic names", () => {
    expect(brandMatchForms("Gel", "X")).toEqual([]);
    expect(resolveAgainstIndex({ name: "Gel", brand: null, kind: "product" }, index)).toBeNull();
  });

  it("refuses to guess when two brand products match", () => {
    const ambiguous: BrandIndexEntry[] = [
      { id: "a", name: "Repair Mask", brand_name: "Brand One", kind: "product", brand_user_id: "b1" },
      { id: "b", name: "Repair Mask", brand_name: "Brand Two", kind: "product", brand_user_id: "b2" },
    ];
    expect(resolveAgainstIndex({ name: "Repair Mask", brand: null, kind: "product" }, ambiguous)).toBeNull();
  });
});
