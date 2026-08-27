// Homemade / DIY recipe safety — DETERMINISTIC, not model-dependent.
//
// A commercial product arrives pre-formulated: the brand has already fixed the
// concentration of every ingredient at a level a cosmetic chemist signed off.
// A kitchen recipe has not. "Lavender oil" in a shop-bought conditioner is a
// fraction of a percent; "lavender oil — 10 drops, on its own" is neat
// essential oil going onto a scalp. The presence of an ingredient therefore
// tells us NOTHING about whether it is safe here, which is why homemade
// products get their own concentration-aware safety pass instead of inheriting
// the commercial tone/score logic.
//
// The known DIY hazards below are hard-flagged from the recipe itself, before
// the model is consulted and regardless of what it returns — so a mild-looking
// recipe (shea butter, aloe… and a spoon of bicarb) can never come back reading
// as gentle. The model's job is the nuance on top, never the safety floor.

export interface RecipeItem {
  ingredient: string;
  /** Rendered amount ("2 tbsp", "a handful", "" when not given). */
  amount: string;
  /** Structured numeric quantity, when the client captured one. */
  qty?: string;
  /** Structured unit (g, ml, tsp, tbsp, cup, drops, pumps). */
  unit?: string;
}

/** Units the client can send structured. Anything else is free text. */
const STRUCTURED_UNITS = new Set([
  "g", "ml", "tsp", "tbsp", "cup", "drops", "pumps",
]);

export type HazardSeverity = "hazard" | "caution";

export interface HomemadeHazard {
  id: string;
  /** The recipe line that triggered it, as she wrote it. */
  trigger: string;
  severity: HazardSeverity;
  title: string;
  body: string;
}

export interface HomemadePreservation {
  /** "preserved" only when a real preservative was FOUND in the recipe. */
  status: "preserved";
  /** The preservative ingredients actually present, as she wrote them. */
  names: string[];
  note: string;
}

export interface HomemadeSafety {
  severity: "hazard" | "caution" | "ok";
  headline: string;
  hazards: HomemadeHazard[];
  /** Ingredients with no glossary entry — reasoned about generally only. */
  unverified: string[];
  /**
   * Set only when the recipe has a water phase AND a recognised preservative —
   * an honest shelf-life statement in place of the DIY spoilage warning.
   */
  preservation?: HomemadePreservation;
}

/** Normalises a free-text recipe payload into clean ingredient+amount pairs. */
export function parseRecipe(raw: unknown): RecipeItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipeItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ingredient = String(r.ingredient ?? "").trim();
    if (!ingredient) continue;
    const qty = String(r.qty ?? "").trim();
    const unitRaw = String(r.unit ?? "").trim().toLowerCase();
    const unit = STRUCTURED_UNITS.has(unitRaw) ? unitRaw : "";
    const amount = String(r.amount ?? "").trim() ||
      [qty, unit].filter(Boolean).join(" ");
    out.push({
      ingredient,
      amount,
      ...(qty ? { qty } : {}),
      ...(unit ? { unit } : {}),
    });
  }
  return out;
}

const CARRIER_RX =
  /\b(coconut|olive|jojoba|almond|avocado|castor|grapeseed|sunflower|argan|shea|mango butter|cocoa butter|conditioner|aloe|water|carrier|yoghurt|yogurt|honey|glycerin|oil blend)\b/i;

const ESSENTIAL_OIL_RX =
  /\b(essential oil|peppermint oil|tea tree|rosemary oil|lavender oil|eucalyptus|clove oil|oregano oil|thyme oil|lemongrass|citronella|ylang)\b/i;

const NEAT_RX = /\b(neat|undiluted|pure|straight|on its own|by itself|100%)\b/i;

function dropCount(item: RecipeItem): number | null {
  // Structured qty+unit is authoritative when present — no string parsing.
  if (item.qty && (item.unit === "drops" || item.unit === "ml")) {
    const n = Number(item.qty.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  const m = item.amount.match(/(\d+(?:\.\d+)?)\s*(?:drops?|ml)\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * Hard-flags known DIY hazards from the recipe.
 *
 * `hasCarrier` matters only for essential oils: everything else on this list is
 * a hazard at any dilution a kitchen can achieve.
 */
export function detectHomemadeHazards(recipe: RecipeItem[]): HomemadeHazard[] {
  const hazards: HomemadeHazard[] = [];
  const hasCarrier = recipe.some((r) => CARRIER_RX.test(r.ingredient));
  const seen = new Set<string>();
  const push = (h: HomemadeHazard) => {
    if (seen.has(h.id)) return;
    seen.add(h.id);
    hazards.push(h);
  };

  for (const item of recipe) {
    const name = item.ingredient;
    const amount = item.amount;
    const line = `${name} — ${amount || "no amount given"}`;
    const drops = dropCount(item);

    if (ESSENTIAL_OIL_RX.test(name)) {
      const neat = NEAT_RX.test(amount) || NEAT_RX.test(name) || !hasCarrier;
      const heavy = drops !== null && drops > 12;
      if (neat || heavy) {
        push({
          id: "neat-essential-oil",
          trigger: line,
          severity: "hazard",
          title: "Essential oil is not diluted here",
          body:
            "Essential oils are concentrated volatile compounds. Applied without a carrier oil or a base, they sit on the skin at full strength, which can cause contact irritation, sensitisation and burning of the scalp — and sensitisation builds with repeat exposure rather than settling down. " +
            (hasCarrier
              ? "Keep the essential oil to a few drops per tablespoon of the carrier in this recipe rather than the amount listed."
              : "There is no carrier oil or base in this recipe to dilute it into.") +
            " If your scalp stings, tingles hard or reddens, rinse it out with water.",
        });
      }
    }

    if (/\b(baking soda|bicarb|bicarbonate|sodium bicarbonate)\b/i.test(name)) {
      push({
        id: "baking-soda",
        trigger: line,
        severity: "hazard",
        title: "Baking soda sits far above hair's pH",
        body:
          "Baking soda is strongly alkaline (around pH 9). Hair's cuticle lies flat in a mildly acidic range, so an alkaline paste swells the strand and lifts the cuticle scales open. Repeated use leaves the cuticle raised, which is what the roughness, tangling and snapping that follow a bicarb wash actually are — and cuticle loss does not grow back.",
      });
    }

    if (/\b(egg|eggs|egg yolk|egg white)\b/i.test(name)) {
      push({
        id: "raw-egg",
        trigger: line,
        severity: "caution",
        title: "Raw egg behaves as an uncontrolled protein load",
        body:
          "Egg protein molecules are far too large to enter the strand, so they dry as a film on the outside. On hair that is not protein-deficient that film reads as stiffness and brittleness rather than strength, and raw egg carries a food-hygiene risk plus an odour that survives rinsing. There is no hair benefit here that a formulated protein treatment does not deliver more predictably.",
      });
    }

    if (/\b(lemon|lime)\s*(juice)?\b/i.test(name) || /\blemon juice\b/i.test(name)) {
      push({
        id: "lemon-juice",
        trigger: line,
        severity: "hazard",
        title: "Lemon juice plus heat or sun is a real burn risk",
        body:
          "Citrus juice is acidic (around pH 2) and photoactive. The \"natural lightening\" effect people chase is oxidative damage to the pigment and the cuticle, accelerated by UV or heat — the same chemistry as a bleach, without the buffering. On skin it also causes phytophotodermatitis: genuine chemical burns and lasting dark patches where the juice sat in sunlight. Keep it off the scalp and away from heat and daylight.",
      });
    }

    if (/\b(cinnamon|cassia)\b/i.test(name)) {
      push({
        id: "cinnamon",
        trigger: line,
        severity: "hazard",
        title: "Cinnamon \"growth\" mixes burn the scalp",
        body:
          "Cinnamon contains cinnamaldehyde, which irritates skin directly. The warmth and tingle these mixes are famous for is inflammation, not circulation doing something useful for growth, and it can leave chemical burns and lasting redness on the scalp. Inflaming a follicle does not lengthen a hair.",
      });
    }

    if (/\b(chilli|chili|cayenne|capsicum|pepper extract|capsaicin|mustard powder|ginger juice)\b/i.test(name)) {
      push({
        id: "capsaicin",
        trigger: line,
        severity: "hazard",
        title: "Chilli-based mixes are a chemical burn risk",
        body:
          "Capsaicin and mustard-family compounds work by activating pain and heat receptors in the skin. The burning sensation is the mechanism, not a side effect, and on a scalp under a covering it can blister. It also transfers straight to eyes and hairline. There is no growth pathway that this triggers.",
      });
    }

    if (/\b(apple cider vinegar|acv|vinegar)\b/i.test(name) && (NEAT_RX.test(amount) || !hasCarrier)) {
      push({
        id: "neat-vinegar",
        trigger: line,
        severity: "caution",
        title: "Vinegar needs diluting into water",
        body:
          "Undiluted vinegar sits around pH 2-3. That is acidic enough to sting broken skin and, used often, to leave the scalp tight and flaky. Diluted heavily into water it is simply a mild acid rinse.",
      });
    }
  }

  // Water-based homemade mixes have no preservative system. This is not a
  // scare — it is why a fridge jar of aloe/tea/yoghurt mask is a two-or-three
  // day thing, not a bottle you keep.
  const waterPhase = recipe.find((r) =>
    /\b(water|aloe|tea|rice water|milk|yoghurt|yogurt|juice|brew|infusion|flaxseed|hibiscus)\b/i.test(r.ingredient)
  );
  if (waterPhase) {
    hazards.push({
      id: "no-preservative",
      trigger: `${waterPhase.ingredient} — ${waterPhase.amount || "no amount given"}`,
      severity: "caution",
      title: "Nothing in this recipe preserves it",
      body:
        "Anything with water, aloe, tea, milk or a plant brew in it grows bacteria and mould from the moment it is mixed, and a shop-bought product only stays stable because it contains a preservative system. Mix what you need, keep it in the fridge, and throw it away after two or three days — or sooner if it smells or looks different.",
    });
  }

  return hazards;
}

/** The safety object stitched onto the analysis payload. */
export function buildHomemadeSafety(
  recipe: RecipeItem[],
  unverified: string[],
): HomemadeSafety {
  const hazards = detectHomemadeHazards(recipe);
  const worst: HomemadeSafety["severity"] = hazards.some((h) => h.severity === "hazard")
    ? "hazard"
    : hazards.length
      ? "caution"
      : "ok";
  const headline = worst === "hazard"
    ? "This recipe contains something I'd want you to change before you use it"
    : worst === "caution"
      ? "A couple of things to handle carefully with this one"
      : "Nothing in this recipe raises a safety concern";
  return { severity: worst, headline, hazards, unverified };
}

/** Prompt block: tells the model this is a kitchen recipe, not a formulation. */
export function homemadeRecipeBlock(
  recipe: RecipeItem[],
  hazards: HomemadeHazard[],
  unverified: string[],
): string {
  // Structured amounts are handed over as machine-readable qty/unit so the
  // model never has to parse a loose string; free text is passed through
  // verbatim and labelled as such, and a missing amount is stated plainly.
  const lines = recipe
    .map((r) => {
      if (r.qty && r.unit) {
        return `- ${r.ingredient}: quantity=${r.qty} unit=${r.unit} (exact, measured)`;
      }
      if (r.unit) return `- ${r.ingredient}: unit=${r.unit}, quantity not given`;
      if (r.qty) return `- ${r.ingredient}: quantity=${r.qty}, unit not given`;
      if (r.amount) return `- ${r.ingredient}: "${r.amount}" (her own words, unmeasured)`;
      return `- ${r.ingredient}: amount not given`;
    })
    .join("\n");
  const hazardLines = hazards.length
    ? hazards.map((h) => `- ${h.title} (from "${h.trigger}")`).join("\n")
    : "- none detected";
  const unverifiedLines = unverified.length ? unverified.join(", ") : "none";

  return `

HOMEMADE RECIPE — THIS IS NOT A COMMERCIAL FORMULATION:
This product was mixed by the member in her own kitchen. A shop-bought product is pre-formulated: a chemist has already fixed every concentration at a level that is safe and stable. NONE of that applies here. You must NOT assume an ingredient is at a safe or effective concentration just because it appears in the list. Reason about the AMOUNT she gave for each ingredient, and about the ratio between them, and say plainly when an amount is too high, too low to do anything, or unmeasurable.

Recipe as recorded. Lines marked "exact, measured" give a structured quantity and unit — treat those as precise and reason numerically about them and about the ratios between them. Lines in her own words are approximate, and "amount not given" means you must not assume any concentration:
${lines}

Already hard-flagged by STRAND's own safety check — treat these as established, do not soften them, do not contradict them, and do not repeat them at length (they are shown to her separately as a standalone caution):
${hazardLines}

Ingredients with NO entry in STRAND's verified glossary: ${unverifiedLines}
For any ingredient in that list you may reason generally, but you must hedge the language ("commonly used for…", "generally understood to…") rather than stating its behaviour as verified fact. Never present an unverified kitchen ingredient with the same certainty as a glossary-verified one.

Also remember: a homemade mix has no preservative system and no stability testing, so never imply it keeps like a bottled product.`;
}

/**
 * Applies the deterministic safety outcome to the model's payload.
 *
 * - attaches the standalone `homemade_safety` caution
 * - marks unverified ingredient cards `low_confidence`
 * - caps the match score: a recipe carrying a hard hazard can never present as
 *   a good match for her hair, whatever the rest of it contains.
 */
export function applyHomemadeSafety<
  T extends { match_score?: number; ingredients?: unknown; homemade_safety?: HomemadeSafety },
>(analysis: T, safety: HomemadeSafety): T {
  analysis.homemade_safety = safety;

  const unverifiedKeys = new Set(safety.unverified.map((n) => n.trim().toLowerCase()));
  if (Array.isArray(analysis.ingredients)) {
    for (const card of analysis.ingredients as Array<Record<string, unknown>>) {
      const name = String(card?.name ?? "").trim().toLowerCase();
      if (name && unverifiedKeys.has(name)) card.low_confidence = true;
    }
  }

  if (typeof analysis.match_score === "number") {
    const cap = safety.severity === "hazard" ? 25 : safety.severity === "caution" ? 65 : 100;
    analysis.match_score = Math.min(analysis.match_score, cap);
  }
  return analysis;
}
