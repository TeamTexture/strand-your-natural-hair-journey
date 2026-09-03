/**
 * "Why this plan" / "WHY IT MATTERS" regression.
 *
 * The nutrition plan summary rendered its labels ("Why it matters", "What to
 * prioritise") with NOTHING underneath them, because the render-time blood
 * guardrail strips any sentence mentioning follicle-level biology and the
 * labelled section still rendered its heading.
 *
 * Two invariants:
 *  1. Compliant copy renders its body text under the label.
 *  2. Copy whose body is stripped renders NO orphan label at all.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AiProse from "@/components/tips/AiProse";

const wrap = (text: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AiProse text={text} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return container.textContent ?? "";
};

describe("nutrition plan summary rendering", () => {
  it("renders the body under Why it matters for render-safe copy", () => {
    const text =
      "**Why it matters:** your ferritin (stored iron) is low. Iron is what new hair growth draws on.\n\n" +
      "**What to prioritise:** rebuild your iron stores and top up your vitamin D.";
    const out = wrap(text);
    expect(out).toContain("stored iron");
    expect(out).toContain("rebuild your iron stores");
  });

  it("never renders a label with an empty body", () => {
    const text =
      "**Why it matters:** your ferritin is low, which is what your follicles pull from to grow new strands.";
    const out = wrap(text);
    expect(out.replace(/\s/g, "")).toBe("");
  });
});
