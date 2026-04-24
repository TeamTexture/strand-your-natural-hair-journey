// QA harness: render the report with realistic sample data and write to disk.
import { generateIngredientReportPdf } from "./ingredientReportPdf";
import { jsPDF } from "jspdf";
import { writeFileSync } from "node:fs";

// Monkey-patch jsPDF.save to write to a known path instead of triggering a
// browser download (we're running under Node).
// @ts-expect-error patching for test
jsPDF.prototype.save = function (filename: string) {
  const buf = Buffer.from(this.output("arraybuffer"));
  writeFileSync(`/tmp/pdfqa/${filename}`, buf);
  console.log("Wrote /tmp/pdfqa/" + filename);
};

const avoid = [
  { id: "1", ingredient: "Sodium Lauryl Sulfate", reason: "Found in 4 of your lowest rated products", product_count: 4, list_kind: "avoid" as const },
  { id: "2", ingredient: "Isopropyl Alcohol", reason: "Found in 3 of your lowest rated products", product_count: 3, list_kind: "avoid" as const },
  { id: "3", ingredient: "Drying Polyquaternium-7 with a notably long descriptive ingredient name to test wrap behaviour", reason: "Found in 2 of your lowest rated products", product_count: 2, list_kind: "avoid" as const },
  { id: "4", ingredient: "Mineral Oil", reason: "Found in 2 of your lowest rated products", product_count: 2, list_kind: "avoid" as const },
];

const favourites = [
  { id: "f1", ingredient: "Shea Butter", reason: "Found in 5 of your highest rated products", product_count: 5, list_kind: "favourite" as const },
  { id: "f2", ingredient: "Glycerin", reason: "Found in 4 of your highest rated products", product_count: 4, list_kind: "favourite" as const },
  { id: "f3", ingredient: "Hydrolysed Wheat Protein", reason: "Found in 3 of your highest rated products", product_count: 3, list_kind: "favourite" as const },
  { id: "f4", ingredient: "Aloe Barbadensis Leaf Juice", reason: "Found in 2 of your highest rated products", product_count: 2, list_kind: "favourite" as const },
];

generateIngredientReportPdf({ userName: "Maya Thompson", avoid, favourites });

// Also test the empty + long-list cases
generateIngredientReportPdf({ userName: "Test User", avoid: [], favourites: [] });

const big = Array.from({ length: 24 }, (_, i) => ({
  id: `b${i}`, ingredient: `Test Ingredient #${i + 1}`,
  reason: `Found in ${(i % 4) + 2} of your lowest rated products`,
  product_count: (i % 4) + 2, list_kind: "avoid" as const,
}));
generateIngredientReportPdf({ userName: "Long List", avoid: big, favourites });
