// Re-implement generateIngredientReportPdf inline by importing the source &
// monkeypatching `doc.save` after construction. Easiest: patch jsPDF.prototype
// THEN delete the own property on each instance after construction. We can't
// inject into instances we don't see, so we shim the constructor.
import * as JspdfMod from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("/tmp/pdfqa", { recursive: true });

const Real = JspdfMod.jsPDF;
function Wrapped(this: any, ...args: any[]) {
  const inst = new (Real as any)(...args);
  inst.save = function(filename: string) {
    const buf = Buffer.from(inst.output("arraybuffer"));
    writeFileSync(`/tmp/pdfqa/${filename}`, buf);
    console.log("wrote", filename);
  };
  return inst;
}
Wrapped.prototype = Real.prototype;
// @ts-ignore
(JspdfMod as any).jsPDF = Wrapped;

const { generateIngredientReportPdf } = await import("./ingredientReportPdf");
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
