import { jsPDF } from "jspdf";
import { writeFileSync } from "node:fs";
const d = new jsPDF();
d.setFont("helvetica", "bold");
d.setFontSize(14);
d.text("Sodium Lauryl Sulfate", 20, 30);
d.setFont("helvetica", "normal");
d.text("Sodium Lauryl Sulfate (normal)", 20, 40);
writeFileSync("/tmp/pdfqa/test-bold.pdf", Buffer.from(d.output("arraybuffer")));
