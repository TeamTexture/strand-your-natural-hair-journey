import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WashDaySteps from "@/components/WashDaySteps";

const level = { current: 3 };

vi.mock("@/hooks/useTipsLevel", () => ({
  useTipsLevel: () => ({
    level: level.current,
    setLevel: () => undefined,
    answerPrompt: () => undefined,
    needsPrompt: false,
    showExplanations: level.current >= 3,
    showBeginnerHelp: level.current >= 3,
  }),
}));

vi.mock("@/hooks/useWashDaySteps", () => ({
  useWashDaySteps: () => ({
    data: {
      steps: [
        { headline: "Sectioning", body: "Split hair into four sections.", why: "Even coverage." },
        { headline: "Cleanse", body: "Shampoo the scalp only.", why: "Removes build-up." },
      ],
      stale: false,
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

describe("wash day steps card", () => {
  beforeEach(cleanup);

  const mount = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WashDaySteps />
      </QueryClientProvider>,
    );

  const open = () => {
    fireEvent.click(screen.getByRole("button", { name: /Your wash day, step by step/i }));
  };

  it("renders collapsed with a summary line", () => {
    level.current = 3;
    mount();
    expect(screen.getByText(/2 steps · starts with sectioning/)).toBeTruthy();
    expect(screen.queryByText(/Split hair into four sections/)).toBeNull();
  });

  it("level 1 shows titles only", () => {
    level.current = 1;
    mount();
    open();
    expect(screen.getByText("Sectioning")).toBeTruthy();
    expect(screen.queryByText(/Split hair into four sections/)).toBeNull();
    expect(screen.queryByText(/Even coverage/)).toBeNull();
  });

  it("level 3 shows titles, instruction and why", () => {
    level.current = 3;
    mount();
    open();
    expect(screen.getByText("Sectioning")).toBeTruthy();
    expect(screen.getByText(/Split hair into four sections/)).toBeTruthy();
    expect(screen.getByText(/Even coverage/)).toBeTruthy();
  });
});
