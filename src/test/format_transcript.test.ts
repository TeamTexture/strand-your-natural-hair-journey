import { describe, it, expect } from "vitest";
import { toParagraphs, transcriptPreview, splitSentences } from "@/lib/formatTranscript";

const NOTE =
  "Honestly, my hair feels great. This is a routine that I really like. It's a routine I'm going to likely keep using. The Dove products are amazing, and I don't envision I'm going to stray too far from them because I think they're absolutely fantastic. I'm also pretty obsessed with the K18 detox shampoo. I've used it for a while now, and although, yes, of course, because it is a very deeply cleansing shampoo, it does make my hair feel a little bit tacky, that is to be expected. And I genuinely love using it on my scalp and then following up with a more moisturizing shampoo. So, this is like a combo that I absolutely love.";

describe("transcript formatting", () => {
  it("breaks a long transcript into several paragraphs", () => {
    const paras = toParagraphs(NOTE);
    expect(paras.length).toBeGreaterThan(2);
    // No words lost or invented.
    expect(paras.join(" ").split(/\s+/).length).toBe(NOTE.split(/\s+/).length);
  });

  it("leaves short notes as one paragraph", () => {
    expect(toParagraphs("Felt soft. No breakage.")).toHaveLength(1);
  });

  it("respects breaks the member already made", () => {
    expect(toParagraphs("One thing.\n\nAnother thing.")).toEqual(["One thing.", "Another thing."]);
  });

  it("does not split on abbreviations", () => {
    expect(splitSentences("I used approx. 3 pumps. It worked.")).toHaveLength(2);
  });

  it("previews whole sentences and reports the full word count", () => {
    const p = transcriptPreview(NOTE)!;
    expect(p.truncated).toBe(true);
    expect(p.text.length).toBeLessThanOrEqual(230);
    expect(p.text.endsWith("…")).toBe(false);
    expect(p.words).toBe(NOTE.split(/\s+/).length);
  });

  it("does not truncate a note that already fits", () => {
    const p = transcriptPreview("Hair felt lovely today.")!;
    expect(p.truncated).toBe(false);
  });
});
