import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("/tmp/pdfqa", { recursive: true });

const OrigCtor = jsPDF;
const Wrapped: any = function(this: any, ...args: any[]) {
  const inst = new (OrigCtor as any)(...args);
  inst.save = function(filename: string) {
    const buf = Buffer.from(inst.output("arraybuffer"));
    writeFileSync(`/tmp/pdfqa/${filename}`, buf);
    console.log("wrote", filename);
  };
  return inst;
};
// @ts-ignore
(await import("jspdf") as any).jsPDF = Wrapped; // won't actually mutate exports

// Easier: just call the internal logic via patched module.
// Re-implement: import the source of ingredientReportPdf, replace `new jsPDF` references.
