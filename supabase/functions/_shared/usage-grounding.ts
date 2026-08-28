// USAGE GROUNDING — "How to use this for your hair" must never invent a
// technique specific the manufacturer never stated.
//
// Real incident (Nylah's Thrive Triple Action Scalp Serum): the app wrote
// "Apply directly to damp scalp partings" while the box says "Apply directly
// into the scalp daily using the pipette provided and massage into the scalp
// for five minutes." Nothing about damp/wet anywhere — the app invented an
// application condition.
//
// Same discipline as the ingredient claim work: a SPECIFIC condition (hair
// state, amount, timing, tool, frequency, temperature) is only allowed when it
// is present in the real manufacturer directions supplied to the prompt. When
// there are no directions at all, general safe-use guidance is permitted but
// must be FLAGGED as general, never stated as if specific to this product.

export type UsageSource = "label_photo" | "brand_page" | "none";

export interface UsageDirections {
  /** Verbatim manufacturer directions, or null when none could be sourced. */
  text: string | null;
  source: UsageSource;
}

export const usageSourceLabel = (source: UsageSource): string =>
  source === "label_photo"
    ? "photographed product label"
    : source === "brand_page"
      ? "brand's official product page"
      : "no manufacturer directions available";

// ── ANTI-ANCHORING (2026-08-28) ────────────────────────────────────────
// After an example sentence in this file used "high density hair", the models
// started reaching for density on products where density changes nothing. The
// example was depth guidance, not a template. We now (a) tell the prompt to
// select the trait by this product's mechanism, and (b) tell it which traits it
// already used on her other products so it cannot silently repeat one.

/** Profile traits the how-to-use copy can legitimately reason about, with the
 *  phrasings that count as "this trait was named". */
const TRAIT_PATTERNS: { trait: string; re: RegExp }[] = [
  { trait: "density", re: /\b(high|low|medium)?\s*density\b|\bdense\b|\bthick head of hair\b/i },
  { trait: "porosity", re: /\bporosity\b|\bporous\b|\bdries out quickly\b|\bholds (?:on to )?moisture\b/i },
  { trait: "elasticity/protein", re: /\belasticity\b|\bprotein\b|\bsnaps? back\b|\bbond\b/i },
  { trait: "strand diameter", re: /\bfine strands?\b|\byour strands are fine\b|\bcoarse strands?\b|\bstrand (?:diameter|thickness)\b/i },
  { trait: "curl pattern", re: /\bcurl pattern\b|\bcoil(?:s|y)\b|\bkink(?:s|y)\b|\bwav(?:e|y)\b/i },
  { trait: "length", re: /\byour length\b|\bshort hair\b|\blonger hair\b|\bhair length\b/i },
  { trait: "scalp condition", re: /\bscalp (?:condition|is|feels|gets)\b|\bflak(?:e|y|ing)\b|\bitch(?:y|ing)\b|\bsensitive scalp\b/i },
  { trait: "current style", re: /\bin (?:your )?(?:cornrows|braids|twists|locs|afro|mohawk|protective style)\b|\bcurrent style\b|\bwhile (?:you'?re )?in style\b/i },
  { trait: "texture", re: /\bsurface texture\b|\bcoarse hair\b|\bsoft hair\b/i },
  { trait: "goal", re: /\byour goal\b|\bgrowth goal\b|\bretain(?:ing)? length\b/i },
  { trait: "challenge", re: /\bbreakage\b|\bshedding\b|\bdryness\b|\bfrizz\b/i },
];

/** Which profile traits a piece of generated how-to-use copy actually named. */
export function detectNamedTraits(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const { trait, re } of TRAIT_PATTERNS) {
    if (re.test(text) && !found.includes(trait)) found.push(trait);
  }
  return found;
}

/** Traits used most often across her other products, most-used first. Fed back
 *  into the prompt so the model can see its own anchoring. */
export function recentTraitUsage(texts: (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const trait of detectNamedTraits(t)) {
      counts.set(trait, (counts.get(trait) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([trait]) => trait);
}

/** Families of "specific condition" claims we police. Each has the phrase
 *  patterns that assert it, plus the tokens that count as support inside the
 *  manufacturer directions. */
interface SpecificFamily {
  id: string;
  label: string;
  /** Asserted in generated copy. */
  assert: RegExp;
  /** Counts as manufacturer support when found in the directions. */
  support: RegExp;
}

const FAMILIES: SpecificFamily[] = [
  {
    id: "hair_state",
    label: "the hair/scalp being wet, damp or dry when the product goes on",
    assert:
      /\b(damp|dampened|wet|soaking[- ]wet|towel[- ]dried|towel[- ]dry|freshly washed|freshly[- ]cleansed|on dry hair|dry hair|dry scalp|dry strands|still wet|water[- ]soaked)\b/i,
    support:
      /\b(damp|dampened|wet|soaking|towel[- ]?dried?|freshly washed|freshly cleansed|dry hair|dry scalp|dry|after washing|after shampoo)\b/i,
  },
  {
    id: "amount",
    label: "how much product to use",
    assert:
      /\b(pea[- ]sized|coin[- ]sized|ten[- ]?pence|palmful|dime[- ]sized|\d+\s*(pumps?|drops?|pipettes?|full pipettes?|sprays?|ml|teaspoons?|tsp|tablespoons?|tbsp)|a\s+(few|couple of)\s+(pumps?|drops?)|generous amount|small amount|thin layer)\b/i,
    support:
      /\b(pea|coin|palmful|dime|\d+\s*(pumps?|drops?|pipettes?|sprays?|ml|teaspoons?|tsp|tablespoons?|tbsp)|amount|layer|liberally|sparingly|full pipette)\b/i,
  },
  {
    id: "timing",
    label: "how long to leave the product on or massage it in",
    assert:
      /\b(\d+\s*(–|-|to)?\s*\d*\s*(seconds?|minutes?|mins?|hours?)|overnight|leave (it )?(on|in) for|for (five|ten|two|three|twenty|thirty)\s+minutes)\b/i,
    support:
      /\b(\d+\s*(–|-|to)?\s*\d*\s*(seconds?|minutes?|mins?|hours?)|overnight|(five|ten|two|three|twenty|thirty)\s+minutes|leave (on|in))\b/i,
  },
  {
    id: "tool",
    label: "a tool or applicator used to apply the product",
    assert:
      /\b(pipette|dropper|nozzle|applicator|spray bottle|comb|brush|denman|cotton pad|cotton wool|massager|massage tool|scalp brush|microfibre|towel|clip|clips)\b/i,
    support:
      /\b(pipette|dropper|nozzle|applicator|spray|comb|brush|cotton pad|cotton wool|massager|massage tool|scalp brush|fingertips|fingers|towel)\b/i,
  },
  {
    id: "frequency",
    label: "how often to use the product",
    assert:
      /\b(daily|every day|twice a day|once a day|every (other )?day|every \d+ days|\d+\s*(times|x)\s*(a|per)\s*(day|week|month)|weekly|twice a week|nightly|each night|every wash|every \d+ weeks)\b/i,
    support:
      /\b(daily|every day|twice a day|once a day|once daily|twice daily|every (other )?day|every \d+ days|\d+\s*(times|x)\s*(a|per)\s*(day|week|month)|weekly|twice a week|nightly|each night|every wash|as (often as )?needed|consistently)\b/i,
  },
  {
    id: "temperature",
    label: "water temperature",
    assert: /\b(warm water|cool water|cold water|hot water|lukewarm)\b/i,
    support: /\b(warm|cool|cold|hot|lukewarm)\b/i,
  },
  {
    id: "rinse",
    label: "whether the product is rinsed out",
    assert: /\b(rinse (it )?(out|off|thoroughly)|wash (it )?out|do not rinse|leave[- ]in|no need to rinse)\b/i,
    support: /\b(rinse|wash out|do not rinse|leave[- ]?in|not rinse)\b/i,
  },
];

/** Sentence-level marker that the writer is giving GENERAL guidance rather
 *  than manufacturer-specific instruction. */
const GENERAL_MARKER =
  /\b(as a general rule|general guidance|generally|as general practice|the manufacturer (does not|doesn't) (say|specify)|no specific direction|not stated on the (label|pack))\b/i;

const sentencesOf = (text: string): string[] =>
  String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

export interface UsageGroundingProblem {
  field: string;
  family: string;
  sentence: string;
  rule: string;
}

/** Deterministic validation: every specific technique condition asserted in
 *  the supplied fields must be supported by the manufacturer directions, or
 *  flagged as general guidance in the same sentence. */
export function validateUsageGrounding(
  fields: Array<{ field: string; text?: string | null }>,
  directions: UsageDirections,
): UsageGroundingProblem[] {
  const source = (directions.text ?? "").toLowerCase();
  const problems: UsageGroundingProblem[] = [];
  for (const { field, text } of fields) {
    if (!text) continue;
    for (const sentence of sentencesOf(text)) {
      if (GENERAL_MARKER.test(sentence)) continue;
      for (const family of FAMILIES) {
        if (!family.assert.test(sentence)) continue;
        if (source && family.support.test(source)) continue;
        problems.push({
          field,
          family: family.id,
          sentence,
          rule:
            `"${sentence}" states ${family.label}, which the manufacturer directions for this product do not specify` +
            (source
              ? ". Only state a technique specific that appears in the real directions"
              : ". No manufacturer directions could be sourced, so either drop the specific condition or mark that sentence explicitly as general guidance") +
            ". Never invent an application condition.",
        });
      }
    }
  }
  return problems;
}

/** Terminal fallback: strip the ungrounded sentences so the member never
 *  reads an invented condition, even if a retry also fails. Returns the
 *  cleaned text plus whether anything was removed. */
export function scrubUngroundedUsage(
  text: string | null | undefined,
  directions: UsageDirections,
): { text: string; removed: number } {
  if (!text) return { text: "", removed: 0 };
  const bad = new Set(
    validateUsageGrounding([{ field: "x", text }], directions).map((p) => p.sentence),
  );
  if (bad.size === 0) return { text, removed: 0 };
  const kept = sentencesOf(text).filter((s) => !bad.has(s));
  return { text: kept.join(" ").trim(), removed: bad.size };
}

/** Extract published directions from scraped brand-page text. */
export function extractDirectionsFromPage(pageText: string): string | null {
  const text = String(pageText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const headings = [
    "how to use",
    "how to apply",
    "directions for use",
    "directions",
    "usage",
    "application",
    "how to",
  ];
  const lower = text.toLowerCase();
  for (const heading of headings) {
    const at = lower.indexOf(heading);
    if (at === -1) continue;
    const slice = text.slice(at + heading.length, at + heading.length + 700).replace(/^[:\s—–-]+/, "");
    // Stop at the next obvious section heading.
    const stop = slice.search(
      /\b(ingredients|inci|full ingredient|reviews?|shipping|delivery|returns|about (the )?brand|frequently asked)\b/i,
    );
    const body = (stop > 40 ? slice.slice(0, stop) : slice).trim();
    if (body.length >= 30) return body.slice(0, 600);
  }
  return null;
}

/** Prompt block. Goes into the task instructions of every function that
 *  generates "how to use this for your hair" copy. */
export function usageGroundingBlock(
  directions: UsageDirections,
  opts: { profileExample?: boolean; recentTraits?: string[] } = {},
): string {
  const base = directions.text
    ? `

HOW-TO-USE GROUNDING — MANUFACTURER DIRECTIONS ARE THE BASE (source: ${usageSourceLabel(directions.source)}):
"""
${directions.text}
"""
RULES (validated after you answer — a violation is rejected):
- These directions are the ONLY permitted source for a specific application condition: whether the hair or scalp is wet/damp/dry, how much to use, how long it stays on or is massaged, any tool or applicator, how often, water temperature, and whether it is rinsed.
- If a detail is NOT in the directions above, you may not state it. Do not write "damp", "wet", "towel-dried", "pea-sized", "for two minutes", "with a comb", "daily" or any equivalent unless the directions say so. Silence in the directions means silence in your copy.
- Keep the manufacturer's own intent intact (where the product goes, what it is for). Never contradict or "improve" it.`
    : `

HOW-TO-USE GROUNDING — NO MANUFACTURER DIRECTIONS AVAILABLE:
No directions could be sourced from a photographed label or the brand's official product page for this product.
RULES (validated after you answer — a violation is rejected):
- You may NOT state any specific application condition as if it were this product's instruction: no wet/damp/dry hair state, no amount, no dwell or massage time, no tool or applicator, no frequency, no water temperature, no rinse instruction.
- General safe-use guidance is allowed ONLY when the sentence says plainly that it is general — e.g. "The manufacturer doesn't specify an amount, so as a general rule start with less than you think you need." Never present general practice as this product's directions.`;

  const bar = opts.profileExample === false
    ? ""
    : `

PERSONALISATION ON TOP OF THE REAL DIRECTIONS — REQUIRED QUALITY BAR:
Take the manufacturer's directions as the base, then work out which of this member's STORED profile fields genuinely change HOW she physically carries out those directions. Change the technique, never the instruction.

STEP 1 — SELECT THE TRAIT BY MECHANISM, DO NOT DEFAULT TO ONE.
Read this product's real directions and its actual ingredients, decide what physically governs the outcome (where it has to land, whether it must absorb, whether heat is involved, whether it stays on, whether it must not build up), then scan her WHOLE record for the trait that changes that specific mechanism: porosity, cuticle state, elasticity/protein history, density, strand diameter, surface texture, curl pattern, length, scalp condition, current style and its scalp access, goal, challenge, and held health/sensitivity data.
Ask yourself plainly: which stored trait, if it were different, would make me give DIFFERENT handling advice for THIS product? That trait — and only that one — is the one to name. If two traits genuinely both change the handling, you may name both; never list traits for the sake of it.

ANTI-ANCHORING RULE (validated — this is a real failure mode we have seen):
- Never default to the same profile trait across products. Density is NOT the house trait, and neither is porosity. A trait is named only because this product's mechanism makes it relevant, never because it was used on a previous product, never because it appears in an example, and never because it is the trait you reach for most easily.
- Do not pattern-match to any example wording in this prompt. The examples show the DEPTH expected, not the trait to pick.
- If the trait you first thought of is not the one that actually changes this product's mechanism, discard it. Different products should genuinely surface different traits.

MECHANISM → TRAIT, ILLUSTRATIVE ONLY (never a lookup table, and only if the trait is actually on her record):
- Product that must reach the scalp: what limits scalp access — current style, coverage, density, scalp condition.
- Leave-in / moisture product that must absorb and hold: porosity, cuticle state, whether it dries out fast.
- Heat or styling product: her heat history, elasticity/protein state, damage or breakage challenge.
- Protein / bond product: elasticity, previous protein response, colour or chemical history.
- Oil, butter or heavy cream: strand diameter, length, weigh-down and build-up risk, roots-vs-ends placement.
- Cleanser: how much product has to come off, scalp condition, how the current style is washed.
None of these override STEP 1 — they are prompts for your own reasoning, not assignments.

STEP 2 — WRITE IT WITH THIS DEPTH.
Whichever trait you selected, the sentence must: name the real stored trait, give a CONCRETE physical adjustment she can perform, tie it to the manufacturer's own intent for the product, and where useful name the mistake to avoid. Two examples, deliberately on different traits, to show depth only:
"As your hair dries out quickly, work this through in sections while your hair still holds water so the leave-in has something to seal in, rather than applying it to hair that has already dried down."
"Because your strands are fine, keep this to your mid-lengths and ends and use less than feels right at first — the oils high in this formula will flatten fine hair at the roots long before you notice them on the ends."
- Name the trait and say WHY it changes the handling — never drop a trait name into generic phrasing ("as you have high density hair, apply evenly" is a failure, whatever the trait).
- If no stored trait genuinely changes the handling of this product, say less rather than inventing a reason. Silence is better than a forced trait.`;

  return `${base}${bar}`;
}

