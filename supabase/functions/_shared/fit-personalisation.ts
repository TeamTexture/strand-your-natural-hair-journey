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
      if (w.length >= 4 && !STOP.has(w)) out.add(w);
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
