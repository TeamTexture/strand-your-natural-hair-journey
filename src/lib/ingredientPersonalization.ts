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
  density: string;
  heatFrequency: string;
  /** ADDITIVE — recorded style, how long it has been worn, what has been done
   *  chemically, strand elasticity, her air-dry share and water intake. All
   *  optional: absent means NOT ESTABLISHED and is never named or guessed at. */
  currentHairstyle?: string;
  daysInStyle?: number | null;
  /** Alias accepted for the same recorded fact. */
  daysInCurrentStyle?: number | null;
  chemicalHistory?:
    | string[]
    | { relaxers?: boolean; permanents?: boolean; color?: boolean };
  elasticity?: string;
  waterIntake?: string;
  airDryPercentage?: number | null;
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

const firstGoalTitle = (profile: IngredientPersonalizationProfile): string =>
  profile.goals.map((goal) => cleanSignal(goal.title)).find(Boolean) ?? "healthy hair";

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
  const name = simplifyIngredientName(ingredient.name || ingredient.INCI) || "This ingredient";
  const porosity = cleanSignal(userProfile.porosity).toLowerCase();
  const climate = cleanSignal(userProfile.climate).toLowerCase();
  const density = cleanSignal(userProfile.density).toLowerCase();
  const heatFrequency = cleanSignal(userProfile.heatFrequency).toLowerCase();
  const stylingHabits = cleanSignal(userProfile.stylingHabits).toLowerCase();
  const style = cleanSignal(userProfile.currentHairstyle ?? "").toLowerCase();
  const daysInStyle = userProfile.daysInStyle ?? null;
  const chemical = (userProfile.chemicalHistory ?? [])
    .map((c) => cleanSignal(c).toLowerCase())
    .filter(Boolean);
  const airDry = userProfile.airDryPercentage ?? null;
  const hasChallenge = (term: string): boolean =>
    userProfile.challenges.some((c) => cleanSignal(c).toLowerCase().includes(term));
  const hasChemical = (...terms: string[]): boolean =>
    chemical.some((entry) => terms.some((t) => entry.includes(t)));
  const styleProtects = /braid|twist|loc|cornrow|weave|wig|bun|protective/.test(style);

  switch (ingredient.role) {
    case "hydration": {
      const goal = firstGoalTitle(userProfile);
      if (porosity.includes("high")) {
        const extra = styleProtects
          ? ` Your ${style} also shields strands from drying air.`
          : "";
        return clampSentencePair(
          `Your high-porosity hair loses water quickly. ${name} helps water stay in each strand for longer, supporting your ${goal} goal.${extra}`,
          190,
        );
      }
      if (porosity.includes("low")) {
        return clampSentencePair(
          `Your low-porosity hair takes water in slowly and can feel weighed down. ${name} adds water lightly without buildup, supporting your ${goal} goal.`,
        );
      }
      if (climate.includes("humid") || climate.includes("dry")) {
        return clampSentencePair(
          `Your water balance is even, but a ${climate} climate can pull it out. ${name} holds that balance steady day to day.`,
        );
      }
      if (heatFrequency.includes("daily") || heatFrequency.includes("weekly")) {
        return clampSentencePair(
          `Your water balance is even, but ${heatFrequency} heat styling dries strands out. ${name} keeps that balance steady between washes.`,
        );
      }
      return clampSentencePair(
        `${name} balances water throughout your curls, supporting your ${goal} goal.`,
      );
    }
    case "protection": {
      if (hasChallenge("breakage")) {
        const after = hasChemical("relax", "colour", "color", "dye", "bleach", "perm", "keratin")
          ? ` It matters more on chemically treated strands.`
          : "";
        return clampSentencePair(
          `Your breakage challenge needs strand strengthening. ${name} forms a protective film that reduces friction, keeping fragile ends intact.${after}`,
          190,
        );
      }
      if (heatFrequency.includes("daily")) {
        return clampSentencePair(
          `Your daily heat styling stresses the strand surface. ${name} shields each strand from heat damage and friction, protecting your curl pattern.`,
        );
      }
      if (hasChemical("relax", "colour", "color", "dye", "bleach", "perm", "keratin")) {
        return clampSentencePair(
          `Chemically treated strands are already fragile. ${name} reinforces the strand surface so processed lengths take less daily wear.`,
        );
      }
      if (density.includes("low") || density.includes("fine")) {
        return clampSentencePair(
          `Your finer strands need gentle reinforcement. ${name} strengthens without weighing down, protecting delicate hair from damage.`,
        );
      }
      if (styleProtects) {
        return clampSentencePair(
          `Your ${style} puts steady pull on the same points. ${name} reinforces strands where that tension lands.`,
        );
      }
      const goal = firstGoalTitle(userProfile);
      return clampSentencePair(
        `${name} protects your strands from daily stress, supporting your ${goal} goal.`,
      );
    }
    case "moisture-lock": {
      if (climate.includes("humid")) {
        return clampSentencePair(
          `Your humid climate causes moisture imbalance and frizz. ${name} seals the strand surface to lock moisture at the right level, keeping curls defined all day.`,
        );
      }
      if (heatFrequency.includes("daily")) {
        return clampSentencePair(
          `Your daily heat styling leaves curls vulnerable to water loss. ${name} seals the strand surface against heat stress, locking moisture in.`,
        );
      }
      if (daysInStyle != null && daysInStyle > 3) {
        const label = style ? `${style}` : "current style";
        return clampSentencePair(
          `Your ${label} is on day ${daysInStyle} and needs lasting water retention. ${name} locks moisture into strands so they stay soft this far in.`,
          190,
        );
      }
      if (airDry != null && airDry >= 60) {
        return clampSentencePair(
          `You air-dry most wash days. ${name} locks in what your conditioner left behind so curls stay soft between washes.`,
        );
      }
      if (stylingHabits.includes("weekly") || stylingHabits.includes("multi-day")) {
        return clampSentencePair(
          `Your multi-day styles need lasting water retention. ${name} locks moisture into each strand so your curls stay soft and bouncy throughout the week.`,
        );
      }
      const goal = firstGoalTitle(userProfile);
      return clampSentencePair(
        `${name} locks moisture into each strand, supporting your ${goal} goal.`,
      );
    }

    default:
      return clampSentencePair(`${name} supports your ${firstGoalTitle(userProfile)} goal.`);
  }
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
