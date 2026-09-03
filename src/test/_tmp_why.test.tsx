import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AiProse from "@/components/tips/AiProse";
const s = "**Why it matters:** your ferritin (stored iron) is low, which is what your follicles draw on to grow new strands — especially along your hairline where you're working to rebuild density.\n\n**What to prioritise:** rebuild your iron stores and bring your vitamin D up to a level where your follicles can actually use it.";
describe("render", () => { it("shows body", () => {
  const { container } = render(<AiProse text={s} />);
  console.log(container.textContent);
});});
