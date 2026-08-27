// style-grounding — HARD GROUNDING for hairstyle references in generated copy.
//
// WHY THIS EXISTS. A member whose recorded current style was "Afro Mohawk" was
// shown sponsored guidance that told her to apply the product "after taking
// down your knotless braids". She has never had knotless braids: the model
// invented a style. The personalisation floor did not catch it, because that
// floor only asks whether the copy references AT LEAST ONE recorded detail — a
// line can reference a real characteristic and invent a style in the same
// sentence and still pass.
//
// This module is the opposite check: every hairstyle NAMED in the copy must be
// a style the member actually has on file. Anything else is fatal.
//
// The phrase list mirrors src/lib/hairstyles.ts (the picker options) plus the
// common ways those styles get named in prose. Keep the two in sync.

/** Hairstyle phrases we detect in prose. Word-boundary matched, case-insensitive. */
export const STYLE_PHRASES: string[] = [
  "knotless braids",
  "knotless",
  "box braids",
  "crochet braids",
  "braids",
  "braid-out",
  "braidout",
  "cornrows",
  "cornrow",
  "flat twists",
  "two-strand twists",
  "mini twists",
  "passion twists",
  "rope twists",
  "twist-out",
  "twistout",
  "twists",
  "faux locs",
  "locs",
  "dreadlocks",
  "dreads",
  "wig",
  "unit",
  "weave",
  "sew-in",
  "silk press",
  "relaxer",
  "relaxed",
  "texturised",
  "texturized",
  "curly perm",
  "mohawk",
  "bantu knots",
  "bantu knot-out",
  "bantu knot",
  "twa",
  "wash and go",
  "wash-n-go",
  "ponytail",
  "low bun",
  "high bun",
  "afro puff",
  "puff",
  "finger coils",
  "finger comb coils",
];

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[_]/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i");
}

/** Every style phrase named in a block of copy. */
export function stylePhrasesIn(text: string | null | undefined): string[] {
  const t = norm(text);
  if (!t) return [];
  const found: string[] = [];
  for (const p of STYLE_PHRASES) {
    if (phraseRegex(p).test(t)) found.push(p);
  }
  return found;
}

/** Style labels this member actually has on file, from an AI context payload. */
export function recordedStyleLabels(context: Record<string, unknown> | null | undefined): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(add);
    const s = norm(v);
    if (s && s !== "not sure yet" && s !== "unknown") out.add(s);
  };
  for (const key of ["currentStyle", "styleProfile"]) {
    const block = (context?.[key] ?? null) as Record<string, unknown> | null;
    if (!block) continue;
    add(block.current_hairstyle);
    add(block.planned_next_style);
    add(block.default_styles);
  }
  const history = (context?.history ?? null) as Record<string, unknown> | null;
  const washDays = (history?.recentWashDays ?? history?.washDays ?? null) as unknown;
  if (Array.isArray(washDays)) {
    for (const w of washDays) add((w as Record<string, unknown>)?.style_after);
  }
  return [...out];
}

/** A phrase is supported when it appears in (or contains) a recorded label. */
function isSupported(phrase: string, recorded: string[]): boolean {
  return recorded.some((label) => label.includes(phrase) || phrase.includes(label));
}

/**
 * HARD CHECK. Returns the style phrases named in the copy that this member does
 * NOT have recorded. A non-empty result is a hallucination and must be fatal.
 *
 * `styleWithheld` = the surface was generated without the member's style in the
 * prompt (the sponsored wash day tip), so ANY style reference is invented.
 */
export function ungroundedStylePhrases(
  text: string | null | undefined,
  context: Record<string, unknown> | null | undefined,
  opts: { styleWithheld?: boolean } = {},
): string[] {
  const named = stylePhrasesIn(text);
  if (!named.length) return [];
  if (opts.styleWithheld) return named;
  const recorded = recordedStyleLabels(context);
  return named.filter((p) => !isSupported(p, recorded));
}

/** Prompt line naming exactly which styles may be referenced. */
export function styleGroundingBlock(
  context: Record<string, unknown> | null | undefined,
  opts: { styleWithheld?: boolean } = {},
): string {
  if (opts.styleWithheld) {
    return `\n\nHAIRSTYLE — HARD RULE\nThis member's hairstyle is NOT supplied on this surface. Do not name, imply or assume ANY hairstyle (no braids, twists, locs, wigs, cornrows, silk press, take-downs or installs). Naming one is rejected.`;
  }
  const recorded = recordedStyleLabels(context);
  if (!recorded.length) {
    return `\n\nHAIRSTYLE — HARD RULE\nThis member has NO hairstyle on file. Do not name, imply or assume any hairstyle. Naming one is rejected.`;
  }
  return `\n\nHAIRSTYLE — HARD RULE\nThe ONLY hairstyles this member has on file are: ${recorded.join(
    ", ",
  )}. You may reference those and nothing else. Naming or implying any other style — braids, knotless braids, cornrows, twists, locs, a wig, a weave, a silk press, a take-down or an install she has not recorded — is a factual error and is rejected. Never invent a hairstyle, product, characteristic or event that is not in the supplied context.`;
}
