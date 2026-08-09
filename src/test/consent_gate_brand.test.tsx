import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConsentGateScreen from "@/pages/ConsentGateScreen";
import { mandatoryKeysForRoles, optionalKeysForRoles } from "@/lib/consent";

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

const renderGate = (roles: Parameters<typeof mandatoryKeysForRoles>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ConsentGateScreen
          outstanding={mandatoryKeysForRoles(roles)}
          optionalKeys={optionalKeysForRoles(roles)}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("consent gate — brand account", () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it("never prompts a brand for health data, the medical disclaimer or personalised offers", () => {
    renderGate(["brand"]);
    expect(screen.queryByText(/health information/i)).toBeNull();
    expect(screen.queryByText(/Medical Disclaimer/i)).toBeNull();
    expect(screen.queryByLabelText(/Personalised brand offers/i)).toBeNull();
    expect(screen.getByLabelText(/Marketing emails/i)).toBeTruthy();
  });

  it("lets a brand complete with the base acceptance alone, nothing pre-ticked", async () => {
    renderGate(["brand"]);
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
      marketing_email: false,
    });
  });

  it("a professional is asked for the undertaking instead of health data", () => {
    renderGate(["professional"]);
    expect(screen.getByText(/keep confidential any member health information/i)).toBeTruthy();
    expect(screen.queryByText(/I explicitly consent to STRAND processing my health/i)).toBeNull();
  });

  it("a consumer still gets the health data consent verbatim", () => {
    renderGate(["consumer"]);
    expect(screen.getByText(/I explicitly consent to STRAND processing my health/i)).toBeTruthy();
  });
});
