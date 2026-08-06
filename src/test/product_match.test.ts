import { describe, it, expect } from "vitest";
import {
  findProductMentions,
  productHref,
  normaliseProductText,
  type MatchableProduct,
} from "@/lib/productMatch";

const shelf: MatchableProduct[] = [
  {
    id: "p-k18",
    product_key: "link-1785791726775",
    name: "PEPTIDE PREP™ Detox Shampoo",
    brand: "K18",
    on_shelf: true,
  },
  {
    id: "p-kera",
    product_key: "link-1785828114866",
    name: "Hydrating Detangling Shampoo (Sulfate-Free)",
    brand: "KeraCare",
    on_shelf: true,
  },
  {
    id: "p-lola",
    product_key: "scan-1783664439960",
    name: "Morte Súbita Máscara Super Hidratante (Intense Moisturizing Hair Mask)",
    brand: "Lola Cosmetics",
    on_shelf: true,
  },
  {
    id: "p-off",
    product_key: "scan-off",
    name: "Retired Curl Cream",
    brand: "Old Brand",
    on_shelf: false,
  },
];

const idsFor = (text: string) =>
  findProductMentions(text, shelf).map((m) => m.product.id);

describe("productMatch", () => {
  it("normalises trademarks, diacritics and case", () => {
    expect(normaliseProductText("PEPTIDE PREP™  Detox Shampoo")).toBe(
      "peptide prep detox shampoo",
    );
    expect(normaliseProductText("Morte Súbita Máscara")).toBe("morte subita mascara");
  });

  it("matches the three confirmed evidence products", () => {
    expect(idsFor("Use your Peptide Prep Detox Shampoo first.")).toEqual(["p-k18"]);
    expect(idsFor("Reach for the hydrating detangling shampoo instead.")).toEqual([
      "p-kera",
    ]);
    expect(idsFor("Follow with Morte Súbita Máscara Super Hidratante.")).toEqual([
      "p-lola",
    ]);
  });

  it("maps offsets back to the original text", () => {
    const text = "Follow with Morte Súbita Máscara Super Hidratante today.";
    const [m] = findProductMentions(text, shelf);
    expect(text.slice(m.start, m.end)).toBe("Morte Súbita Máscara Super Hidratante");
  });

  it("prefers the longest match", () => {
    const products: MatchableProduct[] = [
      { id: "long", product_key: "a", name: "Hydrating Detangling Shampoo", brand: null, on_shelf: true },
      { id: "short", product_key: "b", name: "Hydrating Shampoo", brand: null, on_shelf: true },
    ];
    const hits = findProductMentions("Use the Hydrating Detangling Shampoo.", products);
    expect(hits.map((h) => h.product.id)).toEqual(["long"]);
  });

  it("never guesses on an ambiguous mention", () => {
    const products: MatchableProduct[] = [
      { id: "a", product_key: "a", name: "Moisture Milk", brand: "One", on_shelf: true },
      { id: "b", product_key: "b", name: "Moisture Milk", brand: "Two", on_shelf: true },
    ];
    expect(findProductMentions("Use your Moisture Milk.", products)).toEqual([]);
  });

  it("leaves unmatched mentions and off-shelf products as plain text", () => {
    expect(idsFor("Try a generic clarifying wash.")).toEqual([]);
    expect(idsFor("Your Retired Curl Cream is gone.")).toEqual([]);
  });

  it("links to the existing shelf product page keyed on product_key", () => {
    expect(productHref(shelf[0])).toContain("/products/ingredient?key=link-1785791726775");
  });
});
