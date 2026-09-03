import { describe, it } from "vitest";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { emphasisSplit, splitToBlocks, dedupeSentences } from "@/lib/tipsRender";
const body = "your ferritin (stored iron) is low, which is what your follicles draw on to grow new strands — especially along your hairline where you're working to rebuild density.";
describe("f", () => { it("g", () => {
  console.log("PLAIN>>>", JSON.stringify(plainLanguage(body)));
  console.log("DEDUP>>>", JSON.stringify(dedupeSentences(plainLanguage(body), new Set())));
  console.log("BLOCKS>>>", JSON.stringify(splitToBlocks(plainLanguage(body))));
  console.log("EMPH>>>", JSON.stringify(emphasisSplit(body)));
});});
