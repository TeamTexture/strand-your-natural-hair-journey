import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackButtonProvider } from "@/components/BackButtonContext";

const upserted: Record<string, unknown>[] = [];

vi.mock("@/lib/clinicalContext", () => ({
  encryptForStorage: async (items: { id: string; plaintext: string }[]) =>
    Object.fromEntries(items.map((it) => [it.id, `enc:${it.plaintext}`])),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order", "limit", "in", "delete"]) api[k] = () => api;
    api.maybeSingle = async () => ({ data: null, error: null });
    api.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    api.upsert = (payload: Record<string, unknown>) => {
      upserted.push(payload);
      return { error: null };
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

const LocationReader = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderStep = async () => {
  const { default: ProfileStep3Hair } = await import("@/pages/onboarding/ProfileStep3Hair");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/onboarding/profile-step-3-hair"]}>
        <BackButtonProvider>
          <ProfileStep3Hair />
          <LocationReader />
        </BackButtonProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("ProfileStep3Hair", () => {
  beforeEach(() => {
    upserted.length = 0;
    localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it(
    "does not render 'Not sure' options for porosity, density or scalp",
    async () => {
      await renderStep();

      expect(screen.queryByText("Not sure")).not.toBeInTheDocument();

      // Porosity options
      expect(screen.getByText("Soaks in straight away")).toBeInTheDocument();
      expect(screen.getByText("Water sits on top for a while")).toBeInTheDocument();
      expect(screen.getByText("Somewhere in between")).toBeInTheDocument();

      // Density options
      expect(screen.getByText("A lot")).toBeInTheDocument();
      expect(screen.getByText("A little")).toBeInTheDocument();
      expect(screen.getByText("Hardly any")).toBeInTheDocument();

      // Scalp options
      expect(screen.getByText("Dry")).toBeInTheDocument();
      expect(screen.getByText("Oily")).toBeInTheDocument();
      expect(screen.getByText("Comfortable")).toBeInTheDocument();
      expect(screen.getByText("Itchy or sensitive")).toBeInTheDocument();
    },
    15000,
  );

  it("blocks Continue until all five required answers are given", async () => {
    await renderStep();

    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await new Promise((r) => setTimeout(r, 50));

    // No navigation and no upsert because answers are missing
    expect(upserted).toHaveLength(0);
    expect(screen.getByTestId("location").textContent).toBe("/onboarding/profile-step-3-hair");
  });

  it("navigates to the colour step after all five answers are selected", async () => {
    await renderStep();

    fireEvent.click(screen.getByText("Straight"));
    fireEvent.click(screen.getByText("Soaks in straight away"));
    fireEvent.click(screen.getByText("A lot"));
    fireEvent.click(screen.getByText("Comfortable"));
    fireEvent.click(screen.getByText("None"));

    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/onboarding/profile-step-4-colour");
    });

    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({
      user_id: "u1",
      curl_pattern: "Straight",
      porosity: "High",
      density: "Low",
      areas_of_concern: ["None"],
    });
  });
});
