interface ProductAnalysisLike {
  product_name?: unknown;
  brand?: unknown;
  category?: unknown;
  ingredients?: unknown;
  key_ingredients?: unknown;
  ai_summary?: unknown;
  match_score?: unknown;
}

type SavedKeyIngredient = {
  name: string;
  benefit: string;
  flag: "good" | "warn" | "avoid";
  reason: string;
};

const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const cleanTextList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        return (item as { name?: unknown }).name;
      }
      return null;
    })
    .map(cleanText)
    .filter((item): item is string => Boolean(item));
};

const cleanKeyIngredients = (value: unknown): SavedKeyIngredient[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        const name = cleanText(item);
        return name ? { name, benefit: "", flag: "warn" as const, reason: "" } : null;
      }
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = cleanText(row.name);
      if (!name) return null;
      const rawFlag = cleanText(row.flag);
      const flag: SavedKeyIngredient["flag"] = rawFlag === "good" || rawFlag === "warn" || rawFlag === "avoid"
        ? rawFlag
        : rawFlag === "bad" ? "avoid" : "warn";
      return {
        name,
        benefit: cleanText(row.benefit) ?? cleanText(row.reason) ?? "",
        flag,
        reason: cleanText(row.reason) ?? cleanText(row.benefit) ?? "",
      };
    })
    .filter(Boolean);
};

const cleanScore = (value: unknown): number | null => {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
};

export function buildProductSaveFields(data: ProductAnalysisLike, fallbackName = "Untitled product") {
  return {
    name: cleanText(data.product_name) ?? fallbackName,
    brand: cleanText(data.brand),
    category: cleanText(data.category),
    ingredients: cleanTextList(data.ingredients),
    key_ingredients: cleanKeyIngredients(data.key_ingredients),
    ai_summary: cleanText(data.ai_summary),
    match_score: cleanScore(data.match_score),
  };
}