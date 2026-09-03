import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiProse from "@/components/tips/AiProse";
const s = "**Why it matters:** your ferritin (stored iron) is low, which is what your follicles draw on to grow new strands — especially along your hairline where you're working to rebuild density.\n\n**What to prioritise:** rebuild your iron stores and bring your vitamin D up to a level where your follicles can actually use it.";
describe("render", () => { it("shows body", () => {
  const qc = new QueryClient();
  const { container } = render(<QueryClientProvider client={qc}><AiProse text={s} /></QueryClientProvider>);
  console.log("TEXT>>>", container.textContent);
});});
