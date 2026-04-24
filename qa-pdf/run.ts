import { generateIngredientReportPdf } from "./ingredientReportPdf";
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/pdfqa", { recursive: true });
generateIngredientReportPdf({
  userName: "Maya Thompson",
  avoid: [
    { id: "1", ingredient: "Sodium Lauryl Sulfate", reason: "Found in 4 of your lowest rated products", product_count: 4, list_kind: "avoid" },
    { id: "2", ingredient: "Isopropyl Alcohol", reason: "Found in 3 of your lowest rated products", product_count: 3, list_kind: "avoid" },
    { id: "3", ingredient: "Drying Polyquaternium-7 with a notably long descriptive ingredient name", reason: "Found in 2 of your lowest rated products", product_count: 2, list_kind: "avoid" },
  ],
  favourites: [
    { id: "f1", ingredient: "Shea Butter", reason: "Found in 5 of your highest rated products", product_count: 5, list_kind: "favourite" },
    { id: "f2", ingredient: "Glycerin", reason: "Found in 4 of your highest rated products", product_count: 4, list_kind: "favourite" },
  ],
});
generateIngredientReportPdf({ userName: "Empty User", avoid: [], favourites: [] });
const big = Array.from({ length: 24 }, (_, i) => ({
  id: `b${i}`, ingredient: `Test Ingredient #${i + 1}`,
  reason: `Found in ${(i % 4) + 2} of your lowest rated products`,
  product_count: (i % 4) + 2, list_kind: "avoid" as const,
}));
generateIngredientReportPdf({ userName: "Long List", avoid: big, favourites: [] });
