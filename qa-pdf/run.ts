import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("/tmp/pdfqa", { recursive: true });
console.log("hi");
const doc = new jsPDF();
doc.text("Hello", 10, 10);
const buf = Buffer.from(doc.output("arraybuffer"));
writeFileSync("/tmp/pdfqa/basic.pdf", buf);
console.log("wrote", buf.length);
