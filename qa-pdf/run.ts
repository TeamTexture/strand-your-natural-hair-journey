import { generateIngredientReportPdf } from "./ingredientReportPdf";
import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("/tmp/pdfqa", { recursive: true });

(jsPDF.prototype as any).save = function (filename: string) {
  const buf = Buffer.from(this.output("arraybuffer"));
  const path = `/tmp/pdfqa/${filename}`;
  writeFileSync(path, buf);
  process.stdout.write("Wrote " + path + "\n");
};

console.log("starting");

const avoid = [
  { id: "1", ingredient: "Sodium Lauryl Sulfate", reason: "Found in 4 of your lowest rated products", product_count: 4, list_kind: "avoid" as const },
  { id: "2", ingredient: "Isopropyl Alcohol", reason: "Found in 3 of your lowest rated products", product_count: 3, list_kind: "avoid" as const },
  { id: "3", ingredient: "Drying Polyquaternium-7 with a notably long descriptive ingredient name to test wrap behaviour", reason: "Found in 2 of your lowest rated products", product_count: 2, list_kind: "avoid" as const },
  { id: "4", ingredient: "Mineral Oil", reason: "Found in 2 of your lowest rated products", product_count: 2, list_kind: "avoid" as const },
];
const favourites = [
  { id: "f1", ingredient: "Shea Butter", reason: "Found in 5 of your highest rated products", product_count: 5, list_kind: "favourite" as const },
  { id: "f2", ingredient: "Glycerin", reason: "Found in 4 of your highest rated products", product_count: 4, list_kind: "favourite" as const },
];
generateIngredientReportPdf({ userName: "Maya Thompson", avoid, favourites });
generateIngredientReportPdf({ userName: "Empty User", avoid: [], favourites: [] });
const big = Array.from({ length: 24 }, (_, i) => ({
  id: `b${i}`, ingredient: `Test Ingredient #${i + 1}`,
  reason: `Found in ${(i % 4) + 2} of your lowest rated products`,
  product_count: (i % 4) + 2, list_kind: "avoid" as const,
}));
generateIngredientReportPdf({ userName: "Long List", avoid: big, favourites });
console.log("done");
