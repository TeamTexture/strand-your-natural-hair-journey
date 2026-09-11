import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IngredientBenefitCards from "@/components/product/IngredientBenefitCards";

const mocks = vi.hoisted(() => ({
  buildAiContext: vi.fn(),
  fetchIngredientExplainer: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/lib/aiContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aiContext")>();
  return { ...actual, buildAiContext: mocks.buildAiContext };
});

vi.mock("@/hooks/useIngredientExplainer", () => ({
  fetchIngredientExplainer: mocks.fetchIngredientExplainer,
}));

vi.mock("@/components/ingredients/GlossaryRichText", () => ({
  default: ({ text }: { text: string }) => <>{text}</>,
}));

vi.mock("@/components/ingredients/IngredientToken", () => ({
  GlossaryLabel: ({ label }: { label: string }) => <>{label}</>,
}));

const ingredients = [
  { name: "Glycerin", tone: "good" as const, category: "Humectant", body: "Attracts water" },
  { name: "Hydrolyzed Wheat Protein", tone: "good" as const, category: "Protein", body: "Reduces breakage" },
  { name: "Shea Butter", tone: "good" as const, category: "Occlusive", body: "Slows water loss" },
];

const context = {
  hairProfile: { porosity: ["high"] },
  goals: [{ title: "length retention", status: "in_progress", challenges: [] }],
  challenges: ["breakage"],
  currentStyle: null,
  bloodResults: [],
  professional: null,
  tipsLevel: 2,
};

const renderCards = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <IngredientBenefitCards ingredients={ingredients} productId="product-1" />
    </QueryClientProvider>,
  );
};

describe("IngredientBenefitCards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.buildAiContext.mockResolvedValue(context);
    mocks.fetchIngredientExplainer.mockResolvedValue({
      glossary: { what_it_is: "It forms a flexible film around each strand." },
      role_in_product: "It reduces friction in this formula.",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders all three shells before making a profile or science request", () => {
    renderCards();
    expect(screen.getByText("Deep hydration")).toBeTruthy();
    expect(screen.getByText("Breakage protection")).toBeTruthy();
    expect(screen.getByText("All-day moisture lock")).toBeTruthy();
    expect(mocks.buildAiContext).not.toHaveBeenCalled();
    expect(mocks.fetchIngredientExplainer).not.toHaveBeenCalled();
  });

  it("waits one second, prefetches per card, and reveals cached science on tap", async () => {
    renderCards();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });
    expect(mocks.fetchIngredientExplainer).toHaveBeenCalledTimes(3);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /show ingredient science/i })[1]);
      await Promise.resolve();
    });
    expect(screen.getByText(/forms a flexible film around each strand/i)).toBeTruthy();
    expect(mocks.fetchIngredientExplainer).toHaveBeenCalledTimes(3);
  });

  it("keeps a quiet analysing state when prefetch and tap retrieval fail", async () => {
    mocks.fetchIngredientExplainer.mockRejectedValue(new Error("gateway unavailable"));
    renderCards();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });
    expect(mocks.fetchIngredientExplainer).toHaveBeenCalledTimes(3);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /show ingredient science/i })[0]);
      await Promise.resolve();
    });
    expect(screen.getByText("Analysing for you…")).toBeTruthy();
    expect(screen.queryByText(/error|failed|unavailable/i)).toBeNull();
  });
});
