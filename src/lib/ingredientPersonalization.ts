export type IngredientBenefitRole = "hydration" | "protection" | "moisture-lock";

export interface IngredientPersonalizationInput {
  name: string;
  INCI: string;
  role: IngredientBenefitRole;
  howItWorks: string;
}

export interface IngredientPersonalizationProfile {
  porosity: string;
  goals: Array<{ title: string }>;
  challenges: string[];
  climate: string;
  stylingHabits: string;
}

export interface BenefitIngredientCandidate {
  name: string;
  tone: "good" | "warn" | "bad";
  category?: string | null;
  body?: string | null;
}

export interface IngredientBenefitDefinition {
  role: IngredientBenefitRole;
  emoji: string;
  title: string;
}

export const INGREDIENT_BENEFITS: readonly IngredientBenefitDefinition[] = [
  { role: "hydration", emoji: "💧", title: "Deep hydration" },
  { role: "protection", emoji: "🛡️", title: "Breakage protection" },
  { role: "moisture-lock", emoji: "🔒", title: "All-day moisture lock" },
] as const;

const FORBIDDEN = /\b(?:emollient|humectant|molecular[- ]weight|cuticle)\b|\b(?:restores?|adds?) moisture\b|\bhydrates?\b|\b(?:pair|follow|layer|use) with\b/gi;

const cleanSignal = (value: string): string =>
  value
    .replace(FORBIDDEN, "")
    .replace(/\bhydration\b/gi, "water retention")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .slice(0, 48);

const firstSignal = (profile: IngredientPersonalizationProfile): string => {
  const challenge = profile.challenges.map(cleanSignal).find(Boolean);
  if (challenge) return challenge;
  return profile.goals.map((goal) => cleanSignal(goal.title)).find(Boolean) ?? "healthy hair";
};

const porositySentence = (porosity: string): string => {
  const level = cleanSignal(porosity).toLowerCase();
  if (level.includes("high")) return "Your high-porosity hair loses water quickly.";
  if (level.includes("low")) return "Your low-porosity hair can be weighed down by heavy layers.";
  if (level.includes("medium")) return "Your medium-porosity hair still loses water between wash days.";
  return "Your hair profile makes steady water retention important.";
};

const mechanismFor = (ingredient: IngredientPersonalizationInput): string => {
  const name = simplifyIngredientName(ingredient.name || ingredient.INCI) || "This ingredient";
  if (ingredient.role === "protection") {
    return `${name} forms a light film that reduces strand friction`;
  }
  if (ingredient.role === "moisture-lock") {
    return `${name} seals the strand surface to slow water loss`;
  }
  return `${name} helps water stay in each strand for longer`;
};

const clampSentencePair = (value: string, max = 149): string => {
  const cleaned = value.replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const shortened = cleaned.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[,:;–—-]+$/, "");
  return `${shortened}.`;
};

/**
 * Deterministic, local personalisation. It deliberately does not call a model:
 * the same verified ingredient and recorded profile always produce the same copy.
 */
export async function generateIngredientPersonalization(
  ingredient: IngredientPersonalizationInput,
  userProfile: IngredientPersonalizationProfile,
): Promise<string> {
  return ingredientPersonalizationText(ingredient, userProfile);
}

export function ingredientPersonalizationText(
  ingredient: IngredientPersonalizationInput,
  userProfile: IngredientPersonalizationProfile,
): string {
  const signal = firstSignal(userProfile);
  const relevance = signal === "healthy hair"
    ? "supporting your healthy-hair goal"
    : `supporting your ${signal} goal`;
  return clampSentencePair(
    `${porositySentence(userProfile.porosity)} ${mechanismFor(ingredient)}, ${relevance}.`,
  );
}

export function simplifyIngredientName(value: string): string {
  const raw = value.replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const parenthetical = raw.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (parenthetical && parenthetical.length >= 3 && !/extract|root|leaf|seed|oil|butter/i.test(parenthetical)) {
    return parenthetical;
  }
  return raw
    .replace(/\bButyrospermum Parkii\s*\(Shea\)/i, "Shea")
    .replace(/\bAdansonia Digitata\s*\(Baobab\)/i, "Baobab")
    .replace(/\bBalanites Aegyptiaca\s*/i, "Balanite ")
    .replace(/\b(?:Fruit|Kernel|Root|Leaf|Seed) Extract\b/gi, "Extract")
    .replace(/\s+/g, " ")
    .trim();
}

const roleScore = (ingredient: BenefitIngredientCandidate, role: IngredientBenefitRole): number => {
  if (ingredient.tone !== "good") return -1;
  const category = (ingredient.category ?? "").toLowerCase();
  const body = (ingredient.body ?? "").toLowerCase();
  if (role === "hydration") {
    if (/humectant/.test(category)) return 5;
    if (/attracts? water|holds? water|water retention/.test(body)) return 4;
  }
  if (role === "protection") {
    if (/protein|conditioning agent|active/.test(category)) return 5;
    if (/breakage|friction|film|strength|elastic/.test(body)) return 4;
  }
  if (role === "moisture-lock") {
    if (/occlusive|emollient/.test(category)) return 5;
    if (/seal|water loss|coats? the strand/.test(body)) return 4;
  }
  return -1;
};

/** Selects only positive, mechanism-matched ingredients; it never fills a gap by guessing. */
export function selectBenefitIngredients(
  ingredients: BenefitIngredientCandidate[],
  role: IngredientBenefitRole,
): BenefitIngredientCandidate[] {
  return ingredients
    .map((ingredient, index) => ({ ingredient, index, score: roleScore(ingredient, role) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map((entry) => entry.ingredient);
}

export function ingredientBenefitCacheKey(
  productId: string,
  userId: string,
  profileHash: string,
  role: IngredientBenefitRole,
  ingredientName: string,
): readonly string[] {
  return [
    "ingredient-benefit-science",
    `${productId}:${userId}:${profileHash}`,
    role,
    ingredientName.toLowerCase().trim(),
  ] as const;
}
