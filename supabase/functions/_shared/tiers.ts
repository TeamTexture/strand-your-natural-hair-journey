// ── TIERED PERSONALISATION DATA (Part 3, 2026-09-01) ──────────────────────
//
// Every product surface used to send ONE flat context blob: hair profile,
// goals, challenges, shelf, wash-day history, blood panels, supplements,
// medications, professional notes — on every single analysis, whether or not
// the product could plausibly touch any of it. That is slow (tokens the model
// has to read before it can answer), and it is wrong: a conditioner has no
// business reasoning about a thyroid panel.
//
// The member's data now sits in four tiers with different rules:
//
//   Tier 1 — DETERMINISTIC. Decided in code before any model call: declared
//            sensitivity matches, water hardness, and conflicts with what is
//            already on her shelf. No tokens, no latency, no model judgement.
//   Tier 2 — ALWAYS SENT. The durable strand characteristics plus what she
//            told us she is working on. Small and cheap.
//   Tier 3 — CONDITIONAL. Blood panels, supplements, medications, hormonal
//            status, professional notes. Included only when the product could
//            plausibly interact (see `shouldIncludeHealthTier`).
//   Tier 4 — GUIDANCE ONLY. Wash-day and journal behaviour. It may shape HOW
//            to use a product; it may never move the score, so it is stripped
//            from the scoring prompt entirely.
//
// This module is pure and dependency-free so both the edge functions and the
// client mirror (src/lib/contextTiers.ts) can share one definition.

export type Ctx = Record<string, unknown>;

const obj = (v: unknown): Ctx | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Ctx) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ── TIER 2 — always sent ──────────────────────────────────────────────────
/** Context keys that travel on EVERY analysis, whatever the product is. */
export const TIER_2_KEYS = [
  "hairProfile",
  "currentStyle",
  "currentGoal",
  "goals",
  "challenges",
  "tipsLevel",
  "profileConfirmed",
  "location",
  "shelf",
  "tools",
  "wishlist",
] as const;

/** Context keys that only travel when the health pre-check passes. */
export const TIER_3_KEYS = [
  "healthProfile",
  "bloodResults",
  "bloodPanels",
  "supplements",
  "professional",
] as const;

/** Behavioural keys — guidance only, never part of the scoring prompt. */
export const TIER_4_KEYS = ["history"] as const;

// ── TIER 3 — the pre-check ────────────────────────────────────────────────
/** What we know about the product BEFORE the writer call. */
export interface ProductSignals {
  productName?: string | null;
  brand?: string | null;
  category?: string | null;
  applicationArea?: string | null;
  /** Marketing copy / page text / claims, when the surface has any. */
  claims?: string | null;
  ingredients?: string[] | null;
}

/**
 * Product signals that make the member's health data genuinely relevant:
 * anything acting at the scalp, anything sold around density, shedding or
 * regrowth, and the actives whose whole story is a scalp or root mechanism.
 */
const HEALTH_RELEVANT = [
  // Site of action
  /\bscalp\b/i,
  /\bpartings?\b/i,
  /\bfollicle/i,
  /\broots?\b/i,
  /\bhairline\b/i,
  /\bedges\b/i,
  // What it is sold for
  /\bgrowth\b/i,
  /\bregrow/i,
  /\bdensit/i,
  /\bthinning\b/i,
  /\bshedding\b/i,
  /\bhair loss\b/i,
  /\balopecia\b/i,
  /\bdandruff\b/i,
  /\bseborrh/i,
  /\bpsorias/i,
  /\bexfoliat/i,
  // Actives whose mechanism is scalp- or root-level
  /\bcaffeine\b/i,
  /\bpeptide/i,
  /\bbiotin\b/i,
  /\bniacinamide\b/i,
  /\bsaw palmetto\b/i,
  /\brosemary\b/i,
  /\bketoconazole\b/i,
  /\bzinc pyrithione\b/i,
  /\bsalicylic acid\b/i,
  /\bpyroctone\b/i,
  /\bminoxidil\b/i,
  /\bredensyl\b/i,
  /\bprocapil\b/i,
  /\banagain\b/i,
];

export type HealthTierMode = "full" | "compact" | "omitted";

export interface HealthTierDecision {
  mode: HealthTierMode;
  /** Machine reason, for logging and tests. */
  reason: "product_signals_match" | "signals_unknown" | "no_plausible_interaction";
  /** The signal that carried the decision, when there was one. */
  matched?: string;
}

/**
 * Decides whether the member's health tier could plausibly interact with THIS
 * product. Deliberately generous: when the surface knows nothing about the
 * product yet (the photo scan reads the pack inside the model call), the
 * answer is "compact" — a reduced health slice — never a silent omission.
 * Withholding data we might need is worse than a few extra tokens.
 */
export function shouldIncludeHealthTier(signals: ProductSignals): HealthTierDecision {
  const haystack = [
    signals.productName,
    signals.brand,
    signals.category,
    signals.applicationArea,
    signals.claims,
    ...(signals.ingredients ?? []),
  ]
    .map((v) => str(v))
    .filter(Boolean)
    .join(" \u2022 ");

  if (!haystack.trim()) return { mode: "compact", reason: "signals_unknown" };

  for (const re of HEALTH_RELEVANT) {
    const m = haystack.match(re);
    if (m) {
      return { mode: "full", reason: "product_signals_match", matched: m[0].toLowerCase() };
    }
  }
  return { mode: "omitted", reason: "no_plausible_interaction" };
}

// ── TIER 3 — compact form ─────────────────────────────────────────────────
/** Markers with a documented hair or scalp relevance in the manuscript. */
const HAIR_RELEVANT_MARKERS = [
  "ferritin",
  "iron",
  "haemoglobin",
  "hemoglobin",
  "vitamin d",
  "vitamin b12",
  "b12",
  "folate",
  "zinc",
  "tsh",
  "t3",
  "t4",
  "thyroid",
  "testosterone",
  "dheas",
  "shbg",
  "prolactin",
  "oestrogen",
  "estrogen",
];

const isFlaggedStatus = (status: unknown): boolean => {
  const s = str(status).toLowerCase();
  return s.length > 0 && s !== "normal" && s !== "optimal" && s !== "in range";
};

/**
 * The reduced health slice: the conditions, medications and life stage that
 * always matter clinically, plus ONLY the blood markers that are both
 * hair-relevant and outside range. Panel history and deltas are dropped —
 * they belong to the blood surfaces, not to a product verdict.
 */
export function compactHealthTier(context: Ctx): Ctx {
  const out: Ctx = {};
  const health = obj(context.healthProfile);
  if (health) {
    out.healthProfile = {
      lifeStage: health.lifeStage ?? null,
      conditions: health.conditions ?? null,
      medications: health.medications ?? null,
      diet: health.diet ?? null,
    };
  }
  const flagged = arr(context.bloodResults).filter((r) => {
    const row = obj(r);
    if (!row) return false;
    const marker = str(row.marker).toLowerCase();
    const relevant = HAIR_RELEVANT_MARKERS.some((m) => marker.includes(m));
    return relevant && isFlaggedStatus(row.status);
  });
  if (flagged.length > 0) out.bloodResults = flagged;
  const supplements = arr(context.supplements)
    .map((s) => str(obj(s)?.name))
    .filter(Boolean);
  if (supplements.length > 0) out.supplements = supplements;
  return out;
}

// ── PROFILE SIGNAL PROMINENCE — no field is privileged ────────────────────
//
// 2026-09-01. Real scans kept reasoning about POROSITY and little else. The
// scoring validators were never porosity-only, but the context blob is
// JSON.stringify'd in object-key order, and `porosity` sat near the top of
// `hairProfile` on every single call. LLMs weight what they read first, so one
// recorded characteristic was structurally louder than the rest.
//
// The durable characteristics are therefore ROTATED per product: the same
// member sees the same fields, in a different order, for a different product,
// so no one signal is consistently first. Rotation is deterministic (seeded on
// the product identity) so a re-scan of the same product is reproducible and
// the analysis cache is unaffected.

/** The recorded characteristics that must all carry equal prominence. */
export const ROTATING_PROFILE_KEYS = [
  "porosity",
  "density",
  "elasticity",
  "diameter",
  "texture",
  "curlPattern",
  "surface_texture",
  "length_bucket",
  "scalp",
] as const;

/** Signals that always lead, because the member typed them herself. */
const LEADING_PROFILE_KEYS = ["areas_of_concern", "areas", "diagnosed"] as const;

const seedIndex = (seed: string, modulo: number): number => {
  if (modulo <= 0) return 0;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h >>> 0) % modulo;
};

/**
 * Rebuilds a hairProfile object so that (a) the member's own recorded areas of
 * concern lead, and (b) the durable characteristics appear in a rotated order
 * seeded by the product. Values are never changed, added or dropped.
 */
export function rotateProfileSignals(
  profile: unknown,
  seed: string,
): Record<string, unknown> | null {
  const src = obj(profile);
  if (!src) return src as null;
  const present = ROTATING_PROFILE_KEYS.filter((k) => src[k] !== undefined);
  const offset = present.length > 1 ? seedIndex(seed, present.length) : 0;
  const rotated = [...present.slice(offset), ...present.slice(0, offset)];
  const out: Record<string, unknown> = {};
  for (const k of LEADING_PROFILE_KEYS) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  for (const k of rotated) out[k] = src[k];
  for (const [k, v] of Object.entries(src)) {
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

/** Prompt block: every recorded signal is equally available. */
export const PROFILE_BALANCE_BLOCK =
  `\n\nHER RECORDED SIGNALS CARRY EQUAL WEIGHT\n- No single characteristic is more important than the others. Porosity is NOT the default lens: density, elasticity, strand diameter, surface texture, scalp condition, her recorded areas of concern and her recorded challenges are all equally valid reasoning anchors, and the order they appear in below means nothing.\n- Choose the signal THIS product's mechanism actually lands on, and say which one you chose. If the honest answer is a characteristic other than porosity, use it — do not fall back on porosity because it is familiar.\n- Never reason about a characteristic that is not on record, and never infer one from the product.`;

// ── The tiering itself ────────────────────────────────────────────────────

export interface TieredContext {
  /** The context to send to the SCORING prompt. */
  context: Ctx;
  /** Behavioural data, for guidance copy only. Never merged into `context`. */
  guidance: Ctx;
  health: HealthTierDecision;
  /** Keys actually included, for logging. */
  included: string[];
  /** Keys withheld by a tier rule, for logging. */
  withheld: string[];
}

/**
 * Splits a full AiContext-shaped blob into the scoring context (Tier 2 always,
 * Tier 3 conditionally) and the guidance-only slice (Tier 4). Unknown keys are
 * carried through untouched so adding a field to AiContext never silently
 * drops it — only the tiers named above are governed here.
 */
export function tierContext(context: Ctx | null | undefined, signals: ProductSignals): TieredContext {
  const src = obj(context) ?? {};
  // No recorded characteristic is structurally louder than the others: the
  // durable signals are rotated per product before the blob is serialised.
  const profileSeed = [signals.brand, signals.productName, signals.category]
    .map((v) => str(v))
    .filter(Boolean)
    .join("|") || "strand";

  const health = shouldIncludeHealthTier(signals);
  const out: Ctx = {};
  const guidance: Ctx = {};
  const included: string[] = [];
  const withheld: string[] = [];

  const tier3 = new Set<string>(TIER_3_KEYS as readonly string[]);
  const tier4 = new Set<string>(TIER_4_KEYS as readonly string[]);

  for (const [key, value] of Object.entries(src)) {
    if (tier4.has(key)) {
      guidance[key] = value;
      withheld.push(key);
      continue;
    }
    if (tier3.has(key)) continue; // handled below, as one decision
    out[key] = key === "hairProfile" ? rotateProfileSignals(value, profileSeed) : value;
    included.push(key);

  }

  if (health.mode === "full") {
    for (const key of TIER_3_KEYS) {
      if (src[key] === undefined) continue;
      out[key] = src[key];
      included.push(key);
    }
  } else if (health.mode === "compact") {
    const compact = compactHealthTier(src);
    for (const [key, value] of Object.entries(compact)) {
      out[key] = value;
      included.push(key);
    }
    for (const key of TIER_3_KEYS) {
      if (src[key] !== undefined && compact[key] === undefined) withheld.push(key);
    }
  } else {
    for (const key of TIER_3_KEYS) {
      if (src[key] !== undefined) withheld.push(key);
    }
  }

  return { context: out, guidance, health, included, withheld };
}

// ── TIER 1 — deterministic, before any model call ─────────────────────────
export interface Tier1Result {
  /** Water hardness for her recorded postcode, when we have one. */
  waterHardness: "soft" | "moderate" | "hard" | "very-hard" | null;
  /** Ingredients in THIS product that already appear across her shelf. */
  shelfOverlap: string[];
  /** Products on her shelf in the same category — a duplication signal. */
  sameCategoryOnShelf: Array<{ name: string; brand: string | null }>;
}

const OUTWARD = /^([A-Z]{1,2}\d{1,2}[A-Z]?)/;

/** Coarse UK hardness bands, mirroring src/lib/hardWater.ts by area prefix. */
const VERY_HARD = new Set(
  "E EC N NW W WC SW SE KT CR BR DA RM IG EN HA UB TW WD SM CB CM CO IP NR PE SG SS LU MK AL HP RG RH GU ME CT TN BN PO SO SP OX NN LE LN HU"
    .split(" "),
);
const HARD = new Set(
  "BS BA GL SN BH DT DN S DE NG ST CV B DY WR WS WV HR TF SY".split(" "),
);
const MODERATE = new Set(
  "CH CW WA WN M OL SK BB PR FY L BL YO HD HX BD WF LS TS DL DH NE SR CA LA HG".split(" "),
);

export function waterHardnessFor(postcode: unknown): Tier1Result["waterHardness"] {
  const raw = str(postcode).toUpperCase().replace(/\s+/g, "");
  const m = raw.match(OUTWARD);
  if (!m) return null;
  const letters = m[1].replace(/[0-9].*$/, "");
  if (!letters) return null;
  if (VERY_HARD.has(letters)) return "very-hard";
  if (HARD.has(letters)) return "hard";
  if (MODERATE.has(letters)) return "moderate";
  return "soft";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Everything Tier 1 can answer with no model involvement. Declared sensitivity
 * matching stays where it already lives (`_shared/topical-sensitivity.ts`) —
 * this adds the two remaining deterministic reads.
 */
export function runTier1(context: Ctx | null | undefined, signals: ProductSignals): Tier1Result {
  const src = obj(context) ?? {};
  const postcode = obj(src.location)?.postcode ?? null;
  const shelf = arr(src.shelf).map((p) => obj(p)).filter((p): p is Ctx => !!p);

  const mine = new Set((signals.ingredients ?? []).map((i) => norm(str(i))).filter(Boolean));
  const overlapCount = new Map<string, number>();
  for (const p of shelf) {
    for (const raw of arr(p.key_ingredients)) {
      const key = norm(str(raw));
      if (!key || !mine.has(key)) continue;
      overlapCount.set(key, (overlapCount.get(key) ?? 0) + 1);
    }
  }
  const shelfOverlap = [...overlapCount.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 8);

  const category = norm(str(signals.category));
  const sameCategoryOnShelf = category
    ? shelf
      .filter((p) => norm(str(p.category)) === category)
      .slice(0, 5)
      .map((p) => ({ name: str(p.name), brand: str(p.brand) || null }))
      .filter((p) => p.name)
    : [];

  return {
    waterHardness: waterHardnessFor(postcode),
    shelfOverlap,
    sameCategoryOnShelf,
  };
}

/**
 * Prompt block for the deterministic findings. Stated as FACTS the model may
 * not re-litigate — it has already been decided in code.
 */
export function tier1Block(t: Tier1Result): string {
  const lines: string[] = [];
  if (t.waterHardness) {
    lines.push(
      `Water where she washes: ${t.waterHardness.replace("-", " ")}. Mention it only when this product's mechanism genuinely interacts with mineral content.`,
    );
  }
  if (t.shelfOverlap.length > 0) {
    lines.push(
      `Already common across her shelf (3+ products): ${t.shelfOverlap.join(", ")}. This is a NEUTRAL ownership count — never a risk, never a reason to score lower.`,
    );
  }
  if (t.sameCategoryOnShelf.length > 0) {
    lines.push(
      `She already owns in this category: ${
        t.sameCategoryOnShelf.map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name)).join("; ")
      }. Useful for pairing or for saying plainly where this one would sit — not a fault of this product.`,
    );
  }
  if (lines.length === 0) return "";
  return `\n\nALREADY ESTABLISHED IN CODE (do not contradict, do not recompute)\n${
    lines.map((l) => `- ${l}`).join("\n")
  }`;
}

/**
 * Prompt block explaining the tier rules to the model, so it does not reach
 * for data it cannot see and does not treat its absence as meaningful.
 */
export function tierRulesBlock(t: TieredContext): string {
  const health = t.health.mode === "full"
    ? "Her health data (blood markers, supplements, medications, hormonal status) IS included below because this product could plausibly interact with it. Use it only where this product's own mechanism touches it."
    : t.health.mode === "compact"
    ? "Only a reduced health slice is included: recorded conditions, medications, life stage, and the hair-relevant markers that are outside range. There is no fuller panel to reason about, and its absence means nothing."
    : "Her health data is deliberately NOT included: nothing about this product plausibly interacts with blood markers, supplements or medications. Do not mention them, do not speculate about them, and never note that they are missing.";
  return `\n\nWHAT YOU CAN SEE\n- ${health}\n- Wash-day and journal behaviour is NOT part of this judgement. The score comes from the formulation, her strand characteristics, her goal, her challenges and her areas of concern.\n- Absent data is never a finding. Say less rather than reaching for a signal you were not given.${PROFILE_BALANCE_BLOCK}`;
}
