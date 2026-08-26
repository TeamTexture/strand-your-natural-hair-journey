import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConsentGateScreen from "@/pages/ConsentGateScreen";
import { mandatoryKeysForView, optionalKeysForView, unansweredOptional, type ConsentView, type ConsentRow } from "@/lib/consent";

const recorded: Array<Record<string, unknown>> = [];

vi.mock("@/lib/consent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/consent")>("@/lib/consent");
  return {
    ...actual,
    recordConsents: (payload: Record<string, unknown>) => {
      recorded.push(payload);
      return Promise.resolve();
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "brand-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: () => Promise.resolve() } },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => () => {} };
});

const renderGate = (view: ConsentView, rows: ConsentRow[] = []) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ConsentGateScreen
          outstanding={mandatoryKeysForView(view)}
          optionalKeys={unansweredOptional(rows, view)}
          view={view}
          optionalGranted={Object.fromEntries(
            optionalKeysForView(view).map((k) => [
              k,
              rows.filter((r) => r.consent_key === k).slice(-1)[0]?.granted ?? false,
            ]),
          )}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("consent gate — brand account", () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it("never prompts a brand for health data, the medical disclaimer or personalised offers", () => {
    renderGate("brand");
    expect(screen.queryByText(/health information/i)).toBeNull();
    expect(screen.queryByText(/Medical Disclaimer/i)).toBeNull();
    // Marketing consent no longer lives on this screen for anyone — it is asked
    // once on /home after a subscription exists.
    expect(screen.queryByLabelText(/Personalised brand offers/i)).toBeNull();
    expect(screen.queryByLabelText(/Marketing emails/i)).toBeNull();
  });

  it("lets a brand complete with the base acceptance alone, nothing pre-ticked", async () => {
    renderGate("brand");
    const button = screen.getByRole("button", { name: /Accept and continue/i });
    expect(button).toBeDisabled();

    const tick = screen.getByRole("checkbox");
    expect(tick.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(tick);
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    await waitFor(() => expect(recorded.length).toBe(1));
    expect(recorded[0]).toEqual({
      terms: true,
      privacy: true,
      age_18: true,
    });
  });

  it("a professional sees neither the undertaking nor health data at login", () => {
    renderGate("pro");
    expect(screen.queryByText(/keep confidential any member health information/i)).toBeNull();
    expect(screen.queryByText(/I explicitly consent to STRAND processing my health/i)).toBeNull();
    expect(screen.getAllByText(/Medical Disclaimer/i).length).toBeGreaterThan(0);
  });


  it("a consumer still gets the health data consent verbatim", () => {
    renderGate("consumer");
    expect(screen.getByText(/I explicitly consent to STRAND processing my health/i)).toBeTruthy();
  });
});
