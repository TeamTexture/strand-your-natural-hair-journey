// GROUNDING POLICY B — SPONSORED PRODUCT SURFACES
// ===============================================
// 2026-08-09, at the author's instruction.
//
// Two policies, split by surface class:
//
//   POLICY A — editorial surfaces (wash day tip, STRAND goal tip, routine tips,
//   goal steps, hair strand summaries, nutrition guidance, journal
//   encouragement). The three-tier explicit / extension / supplement
//   architecture in _shared/evidence.ts is UNCHANGED. Nothing in this file
//   touches it.
//
//   POLICY B — sponsored product surfaces (sponsored wash day tip, sponsored
//   banner product tips, sponsored product pages, "How to use it for your
//   hair"). The manuscript cannot cover every commercial formula, so
//   ESTABLISHED cosmetic science is permitted for ingredient function and
//   product usage, personalised to the member's recorded profile — subject to
//   four absolute constraints:
//
//     1. Where the manuscript has a position on an ingredient, THE MANUSCRIPT
//        GOVERNS. Mechanical, not a judgement: the lookup in
//        public.manuscript_ingredients (extracted from chapter 15) is matched
//        against the product's declared ingredient list, and the author's own
//        wording is injected as the binding characterisation.
//     2. The terminology lexicon binds absolutely — enforced by
//        checkTerminology() in _shared/terminology.ts, which runs on policy B
//        output exactly as it does on policy A output.
//     3. Never contradict a manuscript position. Divergences are logged to the
//        conflict register (public.industry_manuscript_conflicts) and the
//        author's side is served.
//     4. Brand marketing copy is never a source. Enforced deterministically
//        here: a claim-phrase blocklist plus an n-gram overlap check against
//        the brand's own supplied copy.
//
// Permitted industry sources: ingredient databases of the standard the author
// herself names in chapter 15 (INCIDecoder, Chemists Corner) and peer-reviewed
// cosmetic chemistry. Not permitted: brand marketing, packaging claims,
// influencer or community consensus, anything contested.

declare const Deno: { env: { get(key: string): string | undefined } };

/* ------------------------------------------------------------------ *
 * The manuscript ingredient lookup (extracted from chapter 15)
 * ------------------------------------------------------------------ */

export interface ManuscriptIngredient {
  ingredient: string;
  aliases: string[];
  chapter: number;
  section_heading: string | null;
  page_start: number | null;
  page_end: number | null;
  author_text: string;
  author_position: string | null;
  category: string | null;
}

let lookupCache: { rows: ManuscriptIngredient[]; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function admin() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  // @ts-ignore — esm.sh URL import is Deno-native.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The ingredients the book itself covers. Never throws. */
export async function loadManuscriptIngredients(): Promise<ManuscriptIngredient[]> {
  if (lookupCache && Date.now() - lookupCache.at < TTL_MS) return lookupCache.rows;
  try {
    const db = await admin();
    if (!db) return [];
    const { data, error } = await db
      .from("manuscript_ingredients")
      .select(
        "ingredient, aliases, chapter, section_heading, page_start, page_end, author_text, author_position, category",
      )
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ManuscriptIngredient[];
    lookupCache = { rows, at: Date.now() };
    return rows;
  } catch (e) {
    console.warn("[policy-b] ingredient lookup unavailable:", e);
    return [];
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface CoveredIngredient {
  /** The author's name for it. */
  ingredient: string;
  /** The label as it appears on the product's declared list. */
  declared_as: string;
  /** 1-based position on the declared list — concentration order. */
  position: number | null;
  author_position: string;
  chapter: number;
  page_start: number | null;
}

export interface IngredientMatch {
  covered: CoveredIngredient[];
  /** Declared ingredients the book never names, with their list position. */
  uncovered: Array<{ declared_as: string; position: number }>;
}

/**
 * Mechanical match of a product's declared ingredient list against the
 * manuscript lookup. Position on the list is preserved: chapter 15's first
 * label-reading rule is that ingredients are listed in descending order of
 * concentration, and Gaia Tonanzi's note on the sub-1% rule means position is
 * itself a fact the member is entitled to.
 */
export function matchIngredients(
  declared: string[],
  lookup: ManuscriptIngredient[],
): IngredientMatch {
  const covered: CoveredIngredient[] = [];
  const uncovered: Array<{ declared_as: string; position: number }> = [];
  const seen = new Set<string>();

  declared.forEach((raw, i) => {
    const label = String(raw ?? "").trim();
    if (!label) return;
    const l = norm(label);
    const hit = lookup.find((row) =>
      [row.ingredient, ...(row.aliases ?? [])].some((a) => {
        const t = norm(a);
        return t.length > 2 && new RegExp(`\\b${esc(t)}\\b`).test(l);
      })
    );
    if (hit) {
      if (seen.has(hit.ingredient)) return;
      seen.add(hit.ingredient);
      covered.push({
        ingredient: hit.ingredient,
        declared_as: label,
        position: i + 1,
        author_position: (hit.author_position || hit.author_text).slice(0, 700),
        chapter: hit.chapter,
        page_start: hit.page_start,
      });
    } else {
      uncovered.push({ declared_as: label, position: i + 1 });
    }
  });

  return { covered, uncovered };
}

/* ------------------------------------------------------------------ *
 * The policy B prompt block
 * ------------------------------------------------------------------ */

export interface PolicyBBlockInput {
  productName: string;
  brandName?: string | null;
  declared: string[];
  match: IngredientMatch;
  /** Brand-supplied copy, quoted back ONLY so the writer can see what to ignore. */
  brandCopy?: string | null;
}

/**
 * The sponsored-surface source policy, appended AFTER the evidence set block.
 * The evidence set stays the primary source; this block adds the constrained
 * industry tier and the mechanical manuscript-governance table.
 */
export function policyBBlock(input: PolicyBBlockInput): string {
  const { covered, uncovered } = input.match;

  const positionLines = input.declared.length
    ? input.declared
        .slice(0, 40)
        .map((d, i) => `${i + 1}. ${String(d).trim()}`)
        .join("\n")
    : "(no declared ingredient list supplied)";

  const governed = covered.length
    ? covered
        .map(
          (c) =>
            `- ${c.ingredient} (declared as "${c.declared_as}", position ${c.position} of ${input.declared.length}). THE AUTHOR'S CHARACTERISATION, WHICH GOVERNS: ${c.author_position}`,
        )
        .join("\n")
    : "- (none of the declared ingredients are covered by the author)";

  const outside = uncovered.length
    ? uncovered
        .slice(0, 24)
        .map((u) => `- ${u.declared_as} (position ${u.position})`)
        .join("\n")
    : "- (none)";

  return `SOURCE POLICY FOR THIS SURFACE — SPONSORED PRODUCT GUIDANCE (POLICY B)
This is a paid placement inside the app, and the member is entitled to a real read of the formula. The author's book cannot cover every commercial formula, so ESTABLISHED COSMETIC SCIENCE is permitted here for ingredient function and product usage — personalised to her recorded profile — under four absolute constraints.

CONSTRAINT 1 — WHERE THE AUTHOR HAS A POSITION ON AN INGREDIENT, HER POSITION GOVERNS. Not industry consensus. These declared ingredients are ones she covers. Use HER characterisation and HER stated benefits for them, and nothing else:
${governed}

INGREDIENTS SHE DOES NOT COVER — established cosmetic science may be used for these, and only these, plus general product usage:
${outside}

CONSTRAINT 2 — HER TERMINOLOGY BINDS ABSOLUTELY. No claim from any source may use a word in a way she rejects, however well established the industry claim is. "Hydrates" applied to anything other than water is rejected outright.

CONSTRAINT 3 — NEVER CONTRADICT HER. Where industry guidance diverges from her stated position, write HER position. Do not hedge, do not present both, do not split the difference.

CONSTRAINT 4 — BRAND MARKETING IS NEVER A SOURCE. The brand supplies the ingredient list and product facts only. Marketing and packaging language — "clinically proven", "seals in hydration", "continuous hydration", "up to X days of moisture", "salon quality", and every claim of that kind — must never be repeated, paraphrased, softened or implied, even where the brand's own page states it as fact.${
    input.brandCopy
      ? `\nThe brand's own copy for this product is reproduced below SOLELY so you can recognise and avoid it. It is not evidence and nothing in it may be restated:\n"""${String(input.brandCopy).slice(0, 1200)}"""`
      : ""
  }

PERMITTED INDUSTRY SOURCES: ingredient databases of the standard the author herself names — INCIDecoder, Chemists Corner — and peer-reviewed cosmetic chemistry. FORBIDDEN: brand or packaging claims, influencer or community consensus, trends, anything contested. Where the science is uncertain, say less.

INGREDIENT POSITION IS A FACT AND MUST BE USED. The declared list is in descending order of concentration, and brands exploit the sub-1% rule to place natural-sounding ingredients high and push preservatives and fragrance down. So where a heavily marketed ingredient sits low on the list, or a functional one sits high, say so plainly. This is true even in a paid placement.
DECLARED LIST, IN ORDER:
${positionLines}

PERSONALISATION IS REQUIRED, NOT OPTIONAL. Every claim must connect the formula to her actual recorded profile — porosity and cuticle state, density, strand diameter, surface texture, elasticity, length, areas of concern, current style, planned next style, goal. A generic ingredient description with no reference to her recorded profile fails this policy and is rejected. Examples of the standard expected: a cationic conditioner binds preferentially to damaged cuticle sites, so a raised-cuticle member gets more from the slip than a smooth-cuticle one; a thick oil high on the list is a weighing-down risk at short length with high density; no protein in a formula is a MATCH, not a gap, for a member whose elasticity is strong; panthenol is a humectant and film former, not a protein, which is worth saying because it is commonly mistaken for one.

CLAIM LABELLING. Return an array "claims" alongside your other fields. One entry per substantive claim you make, each { "text": <the sentence, verbatim as written>, "source": "manuscript" | "industry" | "product_fact" }. "manuscript" = it comes from the evidence set or the author's characterisation above. "industry" = established cosmetic science. "product_fact" = the declared ingredient list, a position on it, or a stated product fact. Anything you cannot label is not permitted to be written.`;
}

/* ------------------------------------------------------------------ *
 * CONSTRAINT 4 — brand marketing can never enter the output
 * ------------------------------------------------------------------ */

/** Claim shapes that are marketing, not fact, wherever they come from. */
const MARKETING_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bclinically\s+(?:proven|tested)\b/i, why: "Marketing claim: clinical proof." },
  { re: /\bdermatologist(?:ally)?\s+(?:tested|approved)\b/i, why: "Marketing claim: dermatologist endorsement." },
  { re: /\bseals?\s+in\s+(?:hydration|moisture)\b/i, why: "Marketing claim: sealing hydration in." },
  { re: /\blocks?\s+in\s+(?:hydration|moisture)\b/i, why: "Marketing claim: locking moisture in." },
  { re: /\bcontinuous\s+(?:hydration|moisture)\b/i, why: "Marketing claim: continuous hydration." },
  { re: /\bup\s+to\s+\d+\s*(?:-|\s)?(?:hour|hours|hrs|day|days)\b[^.]{0,40}\b(?:hydration|moisture|moisturis)/i, why: "Marketing claim: timed hydration duration." },
  { re: /\b(?:24|48|72)\s*(?:-|\s)?(?:hour|hr)s?\b[^.]{0,30}\b(?:hydration|moisture)/i, why: "Marketing claim: timed hydration duration." },
  { re: /\b(?:salon|professional)[- ]quality\b/i, why: "Marketing claim: salon quality." },
  { re: /\bmiracle\b|\bbreakthrough\b|\brevolutionar/i, why: "Marketing superlative." },
  { re: /\b\d{1,3}\s*%\s*of\s+(?:users|women|people)\b/i, why: "Marketing consumer-panel statistic." },
  { re: /\b(?:instantly|immediately)\s+(?:transform|repair|restore)/i, why: "Marketing transformation claim." },
];

export interface PolicyViolation {
  claim: string;
  reason: string;
  rule: string;
}

const sentencesOf = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Consecutive-word shingles, for the brand-copy overlap check. */
function shingles(text: string, n: number): Set<string> {
  const w = norm(text).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/**
 * Deterministic enforcement of constraint 4. Two mechanisms:
 *   a) a claim-shape blocklist, which catches marketing language even when the
 *      model paraphrases it away from the brand's exact wording;
 *   b) a 6-word shingle overlap against the brand's own copy, which catches
 *      copy that IS lifted from the brand.
 * A sentence caught by either is removed from the output and logged.
 */
export function detectMarketingClaims(
  text: string,
  brandCopy?: string | null,
): PolicyViolation[] {
  const out: PolicyViolation[] = [];
  if (!text.trim()) return out;
  const brand = brandCopy ? shingles(brandCopy, 6) : null;

  for (const s of sentencesOf(text)) {
    const hit = MARKETING_PATTERNS.find((p) => p.re.test(s));
    if (hit) {
      out.push({ claim: s, reason: hit.why + " Brand marketing is never a source.", rule: "marketing_claim" });
      continue;
    }
    if (brand && brand.size) {
      const mine = shingles(s, 6);
      for (const g of mine) {
        if (brand.has(g)) {
          out.push({
            claim: s,
            reason: `Reproduces the brand's own copy ("${g}"). Brands supply the ingredient list and product facts, not claims.`,
            rule: "brand_copy_reproduced",
          });
          break;
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * CONSTRAINT 3 — the manuscript wins, and the divergence is logged
 * ------------------------------------------------------------------ */

interface KnownConflict {
  ingredient: string;
  topic: string;
  /** Fires when the output takes the INDUSTRY side against the author. */
  detect: (sentence: string) => boolean;
  manuscript_position: string;
  industry_position: string;
}

/**
 * Divergences where the author's position is known and industry consensus
 * points elsewhere. Each detector fires ONLY on output that takes the industry
 * side; such a sentence is removed and the conflict is registered.
 */
const KNOWN_CONFLICTS: KnownConflict[] = [
  {
    ingredient: "Glycerine",
    topic: "Glycerin in high humidity, especially on high-porosity hair",
    detect: (s) => {
      const l = norm(s);
      if (!/\bglycerin(?:e|)\b|\bglycerol\b/.test(l)) return false;
      const humid = /\bhumid(?:ity)?\b|\bdew\s*point\b|\bdamp\s+(?:air|weather)\b/.test(l);
      const negative = /\b(avoid|skip|limit|reduce|cut back|careful|caution|beware|problem|backfire|draw(?:s|n)? (?:too much|excess)|swell|frizz(?:es|y)?)\b/.test(l);
      return humid && negative;
    },
    manuscript_position:
      "Glycerine is a humectant that is especially beneficial in humid environments, where it helps to prevent the hair from becoming dry and brittle.",
    industry_position:
      "Industry guidance advises limiting or avoiding glycerin at high dew points, particularly on high-porosity hair, on the basis that it draws excess atmospheric water into the strand and causes swelling and frizz.",
  },
  {
    ingredient: "Silicones",
    topic: "Whether silicones should be avoided",
    detect: (s) => {
      const l = norm(s);
      if (!/\bsilicone(?:s)?\b|\bdimethicone\b|\bamodimethicone\b/.test(l)) return false;
      return /\b(avoid|steer clear|stay away|never use|bad for|harmful|damaging|suffocat)\b/.test(l);
    },
    manuscript_position:
      "Silicones function primarily as emollients and can be brilliant for very dry, porous strands prone to matting or tangling; they are not to be avoided, they are to be cleansed off properly. Heavy oils and butters weigh curls down in the same way, and silicones are not any worse.",
    industry_position:
      "A large part of the natural hair community, and much industry-adjacent guidance, tells members to avoid silicones outright.",
  },
  {
    ingredient: "Parabens",
    topic: "Whether parabens in cosmetics disrupt hormones",
    detect: (s) => {
      const l = norm(s);
      if (!/\bparaben(?:s)?\b|\bmethylparaben\b|\bpropylparaben\b/.test(l)) return false;
      return /\b(disrupt|endocrine|hormon\w*|unsafe|toxic|carcinogen|harmful)\b/.test(l) &&
        !/\b(no conclusive|not conclusive|cannot conclusively|safe at the concentrations|officially proven .* safe)\b/.test(l);
    },
    manuscript_position:
      "The author records that the ingredients used in cosmetics are safe at the concentrations they are formulated in, and that the current scientific evidence cannot conclusively support endocrine-disruption claims.",
    industry_position:
      "Widespread consumer-facing guidance presents parabens as hormone disruptors to be avoided.",
  },
];

export interface ConflictHit extends PolicyViolation {
  ingredient: string;
  topic: string;
  manuscript_position: string;
  industry_position: string;
}

/** Output that takes the industry side against a known author position. */
export function detectManuscriptConflicts(text: string): ConflictHit[] {
  const out: ConflictHit[] = [];
  for (const s of sentencesOf(text)) {
    for (const c of KNOWN_CONFLICTS) {
      if (!c.detect(s)) continue;
      out.push({
        claim: s,
        reason: `Contradicts the author on ${c.ingredient}. Her position: ${c.manuscript_position}`,
        rule: `manuscript_governs:${c.ingredient.toLowerCase()}`,
        ingredient: c.ingredient,
        topic: c.topic,
        manuscript_position: c.manuscript_position,
        industry_position: c.industry_position,
      });
    }
  }
  return out;
}

/** Register a divergence for the author's review. Best-effort, never throws. */
export async function logConflicts(
  hits: ConflictHit[],
  meta: {
    surface?: string | null;
    functionName: string;
    userId?: string | null;
    evidenceSetId?: string | null;
  },
): Promise<void> {
  if (!hits.length) return;
  try {
    const db = await admin();
    if (!db) return;
    for (const h of hits) {
      const { data } = await db
        .from("industry_manuscript_conflicts")
        .select("id, occurrences")
        .eq("ingredient", h.ingredient)
        .eq("topic", h.topic)
        .maybeSingle();
      if (data?.id) {
        await db
          .from("industry_manuscript_conflicts")
          .update({
            occurrences: Number((data as { occurrences: number }).occurrences ?? 1) + 1,
            last_seen_at: new Date().toISOString(),
            offending_text: h.claim.slice(0, 1000),
            surface: meta.surface ?? null,
            function_name: meta.functionName,
          })
          .eq("id", (data as { id: string }).id);
      } else {
        await db.from("industry_manuscript_conflicts").insert({
          ingredient: h.ingredient,
          topic: h.topic,
          manuscript_position: h.manuscript_position,
          industry_position: h.industry_position,
          industry_source: "Established cosmetic science / community consensus",
          resolution: "manuscript_governs",
          surface: meta.surface ?? null,
          function_name: meta.functionName,
          user_id: meta.userId ?? null,
          evidence_set_id: meta.evidenceSetId ?? null,
          offending_text: h.claim.slice(0, 1000),
        });
      }
    }
  } catch (e) {
    console.warn("[policy-b] failed to log conflict:", e);
  }
}

/* ------------------------------------------------------------------ *
 * AUDIT TRAIL — every claim carries its source class
 * ------------------------------------------------------------------ */

export type SourceClass = "manuscript" | "industry" | "product_fact";

export interface ClaimSource {
  text: string;
  source: SourceClass;
  /** How the class was decided, for the author's audit. */
  basis: string;
}

/**
 * Label every sentence of the served copy with its source class. The model's
 * own labels are honoured where they match a served sentence; anything it did
 * not label is classified deterministically:
 *   product_fact — names a declared ingredient position or the product itself
 *   manuscript   — supported by an evidence passage or a covered ingredient
 *   industry     — everything else that makes a claim
 */
export function classifyClaims(input: {
  text: string;
  modelLabels?: Array<{ text?: unknown; source?: unknown }>;
  evidencePassages: string[];
  covered: CoveredIngredient[];
  declared: string[];
  productName: string;
  brandName?: string | null;
}): ClaimSource[] {
  const evidenceBlob = norm(input.evidencePassages.join(" "));
  const coveredNames = input.covered.map((c) => norm(c.ingredient));
  const declaredNames = input.declared.map((d) => norm(d)).filter((d) => d.length > 2);
  const labels = new Map<string, SourceClass>();
  for (const l of input.modelLabels ?? []) {
    const t = typeof l?.text === "string" ? norm(l.text) : "";
    const s = String(l?.source ?? "");
    if (t && (s === "manuscript" || s === "industry" || s === "product_fact")) {
      labels.set(t, s as SourceClass);
    }
  }

  const out: ClaimSource[] = [];
  for (const s of sentencesOf(input.text)) {
    const l = norm(s);
    const declared = labels.get(l);
    if (declared) {
      out.push({ text: s, source: declared, basis: "Labelled by the writer at generation time." });
      continue;
    }
    const positional = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d{1,2}(?:st|nd|rd|th))\b/.test(l) &&
      declaredNames.some((d) => l.includes(d));
    if (positional || (declaredNames.some((d) => l.includes(d)) && /\b(list|listed|position|sits|declared|contains|no protein|fragrance allergen)\b/.test(l))) {
      out.push({ text: s, source: "product_fact", basis: "States the declared ingredient list or a position on it." });
      continue;
    }
    const manuscriptBacked =
      coveredNames.some((c) => l.includes(c)) ||
      shinglesOverlap(l, evidenceBlob, 5);
    out.push(
      manuscriptBacked
        ? {
            text: s,
            source: "manuscript",
            basis: "Traces to an evidence passage or an ingredient the author characterises.",
          }
        : {
            text: s,
            source: "industry",
            basis: "Established cosmetic science — needs the author's review.",
          },
    );
  }
  return out;
}

function shinglesOverlap(a: string, b: string, n: number): boolean {
  if (!b) return false;
  const A = shingles(a, n);
  const B = shingles(b, n);
  for (const g of A) if (B.has(g)) return true;
  return false;
}
