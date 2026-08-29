// "Works With Your Hair" must ALWAYS reason about the member's own stored data.
//
// The ingredient (molecule) path in ingredient-explainer takes its line verbatim
// from the product analysis. That line is authoritative on the FORMULA, but it is
// not guaranteed to be personalised — when the analysis wrote a purely
// descriptive sentence ("a gentle plant-based surfactant that cleanses without
// stripping…") the member got a rephrase of "What It's Doing Here" and no
// reference to her profile at all. These helpers detect that case so the caller
// can fall back to a genuinely profile-grounded line.
//
// Deliberately deterministic and dependency-free: no model call is needed to
// decide whether a sentence names one of her own data points.

/** Trait nouns that only appear when copy is actually reasoning about her hair. */
const TRAIT_WORDS = [
  "porosity",
  "porous",
  "density",
  "dense",
  "curl",
  "coil",
  "kink",
  "wave",
  "strand",
  "elasticity",
  "elastic",
  "scalp",
  "cuticle",
  "protein",
  "shrinkage",
  "breakage",
  "shedding",
  "length",
  "retention",
  "hairline",
  "edges",
  "colour",
  "coloured",
  "relaxed",
  "bleached",
  "heat",
  "braid",
  "cornrow",
  "twist",
  "loc",
  "wig",
  "weave",
  "style",
  "goal",
  "sensitivity",
  "sensitive",
  "eczema",
  "psoriasis",
  "dandruff",
  "seborrheic",
  "alopecia",
];

const STOP = new Set([
  "the","a","an","and","or","but","that","this","it","its","of","in","on","for","to","with",
  "your","you","hair","without","away","while","is","are","as","by","from","which","them",
  "their","has","have","can","also","more","most","very","essential","gentle","help","helps",
]);

/**
 * Words that are too generic to prove personalisation on their own. Some are
 * stored profile VALUES ("dry scalp", "medium"), but generic ingredient copy
 * uses the same words, so a bare match cannot be counted as reasoning about her.
 */
const GENERIC = new Set([
  ...TRAIT_WORDS,
  "medium", "high", "low", "normal", "moderate", "fine", "thick", "thin", "dry", "oily",
  "moisture", "moisturising", "cleanser", "cleanse", "surfactant", "plant", "based",
  "product", "products", "routine", "water", "daily", "weekly", "type", "types", "mixed",
]);

function words(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Every distinctive string drawn from the member's own record: hair profile
 * values, health profile values, goal titles/challenges, current style and
 * declared sensitivities. Values only — column names are not member data.
 */
export function memberDataTokens(input: {
  hair?: Record<string, unknown> | null;
  health?: Record<string, unknown> | null;
  goals?: Array<Record<string, unknown>> | null;
  sensitivities?: Array<{ name?: string | null }> | null;
  extra?: Array<string | null | undefined>;
}): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const item of v) add(item);
      return;
    }
    if (typeof v === "object") return;
    const s = String(v).trim();
    if (!s || s.length < 3) return;
    if (/^(true|false|null|none|unknown|not sure|other)$/i.test(s)) return;
    for (const w of words(s)) {
      if (w.length >= 5 && !STOP.has(w) && !GENERIC.has(w)) out.add(w);
    }
  };

  for (const [k, v] of Object.entries(input.hair ?? {})) {
    if (/_(id|at)$|^id$/.test(k)) continue;
    add(v);
  }
  for (const [k, v] of Object.entries(input.health ?? {})) {
    if (/_(id|at)$|^id$/.test(k)) continue;
    add(v);
  }
  for (const g of input.goals ?? []) {
    add(g?.title);
    add(g?.target_text);
    add(g?.challenges);
    add(g?.challenge);
  }
  for (const s of input.sensitivities ?? []) add(s?.name);
  for (const e of input.extra ?? []) add(e);
  return [...out];
}

/**
 * True when the copy actually anchors on her record: it names one of her stored
 * values, OR uses a trait noun (porosity/density/scalp/goal…) which only makes
 * sense as a statement about her hair.
 */
export function referencesMemberData(text: string, tokens: string[]): boolean {
  const w = new Set(words(text));
  if (w.size === 0) return false;

  // A stored value of hers appearing verbatim is unambiguous personalisation.
  const tokenSet = new Set(tokens);
  for (const word of w) {
    if (word.length >= 5 && tokenSet.has(word)) return true;
  }

  // A trait noun on its own is NOT enough — generic ingredient copy says
  // "cleanses the scalp and hair" all day. It only counts when the sentence is
  // addressed to her hair specifically ("your porosity", "you shed at the ends").
  const addressesHer = /\byour\b|\byours\b|\byou\b/i.test(text ?? "");
  if (!addressesHer) return false;
  for (const t of TRAIT_WORDS) {
    for (const word of w) {
      if (word === t || word.startsWith(t)) return true;
    }
  }
  return false;
}


/**
 * True when the personalised line is effectively a rephrase of the factual
 * "what it is" / "what it's doing here" copy sitting directly above it.
 */
export function duplicatesFactualCopy(text: string, ...factual: Array<string | null | undefined>): boolean {
  const a = words(text).filter((w) => w.length >= 4 && !STOP.has(w));
  if (a.length === 0) return false;
  for (const f of factual) {
    const b = new Set(words(f ?? "").filter((w) => w.length >= 4 && !STOP.has(w)));
    if (b.size === 0) continue;
    const overlap = a.filter((w) => b.has(w)).length / a.length;
    if (overlap >= 0.6) return true;
  }
  return false;
}

/**
 * Last-resort profile explanation for a glossary fit whose generated sentence
 * was rejected by the science guardrails twice. It makes no unverified claim
 * about the ingredient: it relates a real stored trait to its established
 * meaning and explicitly avoids inferring a product effect from category alone.
 */
export function deterministicProfileFit(input: {
  hair?: Record<string, unknown> | null;
  goals?: Array<Record<string, unknown>> | null;
  ingredientCategory?: string | null;
}): string {
  const hair = input.hair ?? {};
  const value = (keys: string[]): string | null => {
    for (const key of keys) {
      const raw = hair[key];
      if (typeof raw === "string" && raw.trim() && !/unknown|not sure/i.test(raw)) {
        return raw.trim().replace(/_/g, " ").toLowerCase();
      }
    }
    return null;
  };
  const porosity = value(["porosity", "hair_porosity"]);
  const density = value(["density", "hair_density"]);
  const elasticity = value(["elasticity", "hair_elasticity"]);
  const goal = (input.goals ?? []).map((g) => {
    const raw = g?.title ?? g?.target_text;
    return typeof raw === "string" ? raw.trim() : "";
  }).find(Boolean) ?? null;
  const category = (input.ingredientCategory ?? "").toLowerCase();

  if (porosity) {
    const prefix = `Your ${porosity} porosity describes how your cuticle takes in and releases water.`;
    if (/active|peptide|protein/.test(category)) {
      return `${prefix} This ingredient's presence does not establish a follicle or growth effect${goal ? `, so it has not been counted as support for your ${goal.toLowerCase()} goal` : ""}.`;
    }
    if (/surfactant|cleans/.test(category)) {
      return `${prefix} This ingredient's cleansing role does not change that strand trait, so the two are considered separately.`;
    }
    return `${prefix} Its ingredient category alone does not establish a direct effect on that trait, so it has not counted for or against it.`;
  }
  if (elasticity) {
    return `Your ${elasticity} elasticity records how your strands stretch and return. This ingredient's category alone does not establish a direct effect on that trait, so it has not counted for or against it.`;
  }
  if (density) {
    return `Your ${density} density records how many strands grow within an area of scalp. This ingredient's category alone does not establish a direct effect on that count, so it has not counted for or against it.`;
  }
  if (goal) {
    return `Your recorded goal is ${goal.toLowerCase()}. This ingredient's category alone does not establish that it advances that goal, so it has not been counted for or against it.`;
  }
  return "Your stored profile does not establish a direct relationship with this ingredient, so it has not counted for or against your hair.";
}
