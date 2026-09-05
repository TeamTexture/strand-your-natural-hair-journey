import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackButtonProvider } from "@/components/BackButtonContext";

/**
 * The onboarding goal/challenge step writes ONE row to the existing user_goals
 * table. The rules that must never regress:
 *  - "Something else" stores what she TYPED, never the literal option label
 *  - an empty "Something else" BLOCKS Continue (both questions are required)
 *  - the saved status is "in_progress" so useGoals treats it as her live goal
 *  - the row is tagged kind: "onboarding" so it cannot collide with the
 *    numeric length-tracking goals that share the table
 */

const inserted: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order", "limit", "in", "delete"]) api[k] = () => api;
    api.maybeSingle = async () => ({ data: null, error: null });
    api.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    api.insert = (payload: Record<string, unknown>) => {
      // Only the goal row is under test — the user_challenges mirror is asserted
      // separately and must not inflate this count.
      if (table === "user_goals") inserted.push(payload);
      return {
        select: () => ({ maybeSingle: async () => ({ data: { id: "row-1" }, error: null }) }),
      };
    };
    api.update = () => api;
    return api;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => chain(table),
    },
  };
});

const renderStep = async () => {
  const { default: GoalAndChallenge } = await import("@/pages/onboarding/GoalAndChallenge");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/onboarding/goal"]}>
        <BackButtonProvider>
          <GoalAndChallenge />
        </BackButtonProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("onboarding goal step", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("stores her typed words in place of \"Something else\"", async () => {
    await renderStep();

    fireEvent.click(screen.getAllByText("Something else")[0]);
    fireEvent.change(screen.getByLabelText("Your goal, in your words"), { target: { value: "My twist-outs never last past day two" } });
    fireEvent.click(screen.getByText("Breakage"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({
      kind: "onboarding",
      status: "in_progress",
      title: "My twist-outs never last past day two",
      challenges: ["Breakage"],
    });
  });

  it("blocks on an empty \"Something else\" challenge", async () => {
    await renderStep();

    fireEvent.click(screen.getByText("Length"));
    // Multi-select challenge "Something else" left blank — must now block.
    fireEvent.click(screen.getAllByText("Something else")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(inserted).toHaveLength(0);

    fireEvent.click(screen.getByText("Dryness"));
    fireEvent.click(screen.getAllByText("Something else")[1]); // deselect it
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].title).toBe("Length");
    expect(inserted[0].challenges).toEqual(["Dryness"]);
  });

  it("saves nothing when both questions are unanswered", async () => {
    await renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(inserted).toHaveLength(0);
  });
});
