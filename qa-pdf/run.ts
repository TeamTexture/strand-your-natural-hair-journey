import { jsPDF } from "jspdf";
const d = new jsPDF();
console.log("own save?", Object.prototype.hasOwnProperty.call(d, "save"));
console.log("save src", String(d.save).slice(0, 100));
