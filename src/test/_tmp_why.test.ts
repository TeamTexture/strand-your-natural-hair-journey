import { describe, it } from "vitest";
import { condenseProse, dedupeSentences } from "@/lib/tipsRender";
import { parseGuidance } from "@/lib/guidance";
import { splitParagraphs, sentenceGroups } from "@/lib/paragraphs";
const s = "**Why it matters:** your ferritin (stored iron) is low, which is what your follicles pull from to grow new strands.\n\n**What to prioritise:** iron-rich food at every meal, paired with vitamin C.";
describe("x", () => { it("y", () => {
 for (const level of [1,2,3]) {
  const blocks = splitParagraphs(s);
  const limited = level===1?blocks.slice(0,1):level===2?blocks.slice(0,2):blocks;
  const seen = new Set<string>();
  const paras = limited.map(b=>dedupeSentences(condenseProse(b,level),seen).trim()).filter(Boolean).flatMap(b=>sentenceGroups(b,2));
  console.log("LEVEL",level, JSON.stringify(paras));
  paras.forEach(p=>{ const c=condenseProse(p,level); console.log("  cond:",JSON.stringify(c)); console.log("  parsed:", JSON.stringify(parseGuidance(c))); });
 }
});});
