
interface ProductAnalysisLike {

  product_name?: unknown;
  brand?: unknown;
  category?: unknown;
  application_area?: unknown;
  leave_on?: unknown;
  usage_instructions?: unknown;
  ingredients?: unknown;
  key_ingredients?: unknown;
  ai_summary?: unknown;
  match_score?: unknown;
  score_reasons?: unknown;
}

/** Application areas the DB check constraint accepts. */
const APPLICATION_AREAS = [
  "scalp",
  "lengths_ends",
  "scalp_and_lengths",
  "rinse_out",
  "unknown",
] as const;
export type ApplicationArea = (typeof APPLICATION_AREAS)[number];

/** Never guess: anything the model didn't give us stays "unknown". */
const cleanApplicationArea = (value: unknown): ApplicationArea => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (APPLICATION_AREAS as readonly string[]).includes(raw)
    ? (raw as ApplicationArea)
    : "unknown";
};

const cleanLeaveOn = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;



type SavedScoreReason = {
  direction: "plus" | "minus";
  factor: string;
  reason: string;
};

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

const cleanScoreReasons = (value: unknown): SavedScoreReason[] => {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const direction: SavedScoreReason["direction"] | null =
        row.direction === "plus" || row.direction === "minus" ? row.direction : null;
      const factor = cleanText(row.factor);
      const reason = cleanText(row.reason);
      if (!direction || !factor || !reason) return [];
      return [{ direction, factor, reason }];
    })
    .slice(0, 4);
};

export function buildProductSaveFields(
  data: ProductAnalysisLike,
  fallbackName = "Untitled product",
  /** Where the directions came from — the How-to-use grounding hierarchy
   *  needs provenance, so a photographed label is never confused with a
   *  brand page (or with invented generic advice). */
  usageSource?: "label_photo" | "brand_page",
) {
  const usage = cleanText(data.usage_instructions);
  return {
    ...(usage && usageSource ? { usage_instructions_source: usageSource } : {}),
    name: cleanText(data.product_name) ?? fallbackName,
    brand: cleanText(data.brand),
    category: cleanText(data.category),
    application_area: cleanApplicationArea(data.application_area),
    leave_on: cleanLeaveOn(data.leave_on),
    usage_instructions: usage,
    ingredients: cleanTextList(data.ingredients),
    key_ingredients: cleanKeyIngredients(data.key_ingredients),
    ai_summary: cleanText(data.ai_summary),
    match_score: cleanScore(data.match_score),
    score_reasons: cleanScoreReasons(data.score_reasons),
  };
}

