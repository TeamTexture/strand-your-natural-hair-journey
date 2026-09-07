// THE MEMBER READS THE REAL REASON, NEVER "non-2xx".
//
// 2026-09-07. `supabase.functions.invoke` reports every non-2xx as "Edge
// Function returned a non-2xx status code", so a daily cap, the global AI
// ceiling and a genuine server fault all reached the product page as the same
// blank failure. The body our functions send ({ error: "<plain sentence>" }) is
// now read and used, and anything machine-shaped falls back to a plain apology.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
      refreshSession: async () => ({ data: { session: null } }),
    },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/lib/displayedUser", () => ({
  getViewAsUserId: () => null,
  getSignedInUserId: async () => null,
}));

import { supabase } from "@/integrations/supabase/client";
import { aiInvoke, memberFacingAiError } from "@/lib/aiInvoke";

const httpError = (status: number, body: string) => {
  const err = new Error("Edge Function returned a non-2xx status code");
  err.name = "FunctionsHttpError";
  (err as unknown as { context: Response }).context = new Response(body, { status });
  return err;
};

describe("aiInvoke error messages", () => {
  it("surfaces the server's own sentence from a 429 body", async () => {
    const message = "You've hit today's limit for this feature. It resets in a few hours.";
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: httpError(429, JSON.stringify({ error: message })),
    });
    const { error } = await aiInvoke("ingredient-analysis", { productKey: "a" });
    expect((error as Error).message).toBe(message);
  });

  it("never returns 'non-2xx' for a 503 with an empty body", async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: httpError(503, ""),
    });
    const { error } = await aiInvoke("ingredient-analysis", { productKey: "b" });
    expect(memberFacingAiError(error)).not.toMatch(/non-2xx/i);
    expect(memberFacingAiError(error)).toBe(
      "Something went wrong on our side. Please try again in a few minutes.",
    );
  });

  it("passes a plain server sentence through and hides machine wording", () => {
    expect(
      memberFacingAiError(
        new Error(
          "STRAND's AI is unusually busy right now and has paused new requests for a short while. Please try again later.",
        ),
      ),
    ).toMatch(/unusually busy/);
    expect(memberFacingAiError(new Error("Edge Function returned a non-2xx status code")))
      .toBe("Something went wrong on our side. Please try again in a few minutes.");
    expect(memberFacingAiError(null)).toBe(
      "Something went wrong on our side. Please try again in a few minutes.",
    );
  });
});
