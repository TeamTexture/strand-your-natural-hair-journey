console.log("a");
import("./ingredientReportPdf").then(async (m) => {
  console.log("b loaded");
  const { jsPDF } = await import("jspdf");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("/tmp/pdfqa", { recursive: true });
  (jsPDF.prototype as any).save = function (filename: string) {
    const buf = Buffer.from(this.output("arraybuffer"));
    writeFileSync(`/tmp/pdfqa/${filename}`, buf);
    console.log("wrote", filename);
  };
  m.generateIngredientReportPdf({ userName: "Maya", avoid: [
    { id: "1", ingredient: "Sodium Lauryl Sulfate", reason: "Found in 4", product_count: 4, list_kind: "avoid" },
  ], favourites: [
    { id: "f1", ingredient: "Shea Butter", reason: "Found in 5", product_count: 5, list_kind: "favourite" },
  ]});
  console.log("done");
}).catch(e => console.error("ERR", e));
