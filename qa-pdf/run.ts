import { generateIngredientReportPdf } from "./ingredientReportPdf";
import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("/tmp/pdfqa", { recursive: true });
(jsPDF.prototype as any).save = function (filename: string) {
  const buf = Buffer.from(this.output("arraybuffer"));
  writeFileSync(`/tmp/pdfqa/${filename}`, buf);
  console.log("Wrote /tmp/pdfqa/" + filename);
};
try {
  generateIngredientReportPdf({ userName: "Maya Thompson", avoid: [
    { id: "1", ingredient: "Sodium Lauryl Sulfate", reason: "Found in 4 of your lowest rated products", product_count: 4, list_kind: "avoid" },
    { id: "2", ingredient: "Isopropyl Alcohol", reason: "Found in 3 of your lowest rated products", product_count: 3, list_kind: "avoid" },
  ], favourites: [
    { id: "f1", ingredient: "Shea Butter", reason: "Found in 5 of your highest rated products", product_count: 5, list_kind: "favourite" },
  ]});
} catch (e) { console.error("FAIL", e); }
