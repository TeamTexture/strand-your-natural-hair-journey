import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountDeletionControl from "@/components/admin/AccountDeletionControl";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/hooks/useAdminAccountDeletion", () => ({
  useMemberDeletionState: () => ({ data: { deletion_requested_at: null } }),
  useAdminDeletionHistory: () => ({ data: [], isLoading: false }),
  useAdminRequestAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("AccountDeletionControl", () => {
  const wrap = (t: "professional" | "consumer") =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountDeletionControl userId="u1" name="Ada" currentType={t} />
      </QueryClientProvider>,
    );
  it("renders for professionals only", () => {
    const { container } = wrap("consumer");
    expect(container.textContent).toBe("");
    wrap("professional");
    expect(screen.getAllByText("Delete this account").length).toBeGreaterThan(0);
  });
});
