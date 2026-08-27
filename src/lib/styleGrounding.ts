// styleGrounding — client-side mirror of supabase/functions/_shared/style-grounding.ts.
//
// The server validator rejects generated copy that names a hairstyle the member
// does not have on file. This module applies the SAME check to copy we read back
// out of the cache, because cached guidance can legitimately be older than the
// member's current profile: the ad surfaces paint the most recent previously
// generated payload ("stale-first") while a fresh one generates. A stale payload
// written against an old style would otherwise tell her to take down braids she
// no longer wears.
//
// Keep the phrase list in sync with the edge-function copy.

const STYLE_PHRASES: string[] = [
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
  "weave",
  "sew-in",
  "silk press",
  "relaxer",
  "curly perm",
  "mohawk",
  "bantu knots",
  "bantu knot-out",
  "bantu knot",
  "wash and go",
  "wash-n-go",
  "ponytail",
  "low bun",
  "high bun",
  "afro puff",
  "finger coils",
  "finger comb coils",
];

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const phraseRegex = (phrase: string) =>
  new RegExp(`(?<![a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i");


// AMBIGUOUS PHRASES. Words that are style names but also ordinary English in
// product copy ("a low bun", "twists the strand", "wig cap"). They only count as
// a style CLAIM when the copy ties them to wearing/removing a style. Without
// this guard, ordinary prose was flagged as a hallucination — which discarded
// perfectly valid cached guidance and paid for a fresh generation on every view.
const AMBIGUOUS = new Set([
  "braids",
  "twists",
  "locs",
  "dreads",
  "weave",
  "wig",
  "ponytail",
  "low bun",
  "high bun",
]);

const STYLE_CUE =
  /(your|her|my|the|those|these|fresh|new|old|in|into|out of|take down|taking down|took down|install|installed|installing|wear|wearing|wore|remove|removing|refresh|refreshing|between)\s+([a-z-]+\s+){0,2}$/i;

function claimsStyle(text: string, phrase: string): boolean {
  if (!AMBIGUOUS.has(phrase)) return true;
  const re = new RegExp(
    `(?<![a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (STYLE_CUE.test(text.slice(Math.max(0, m.index - 40), m.index))) return true;
  }
  return false;
}

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

/** Style phrases named in the copy that this member does not have on file. */
export function ungroundedStylePhrases(
  text: string | null | undefined,
  context: Record<string, unknown> | null | undefined,
  opts: { styleWithheld?: boolean } = {},
): string[] {
  const t = norm(text);
  if (!t) return [];
  const named = STYLE_PHRASES.filter((p) => phraseRegex(p).test(t) && claimsStyle(t, p));
  if (!named.length) return [];
  if (opts.styleWithheld) return named;
  const recorded = recordedStyleLabels(context);
  return named.filter((p) => !recorded.some((l) => l.includes(p) || p.includes(l)));
}

/** True when nothing in the copy contradicts the member's recorded styles. */
export function isStyleGrounded(
  text: string | null | undefined,
  context: Record<string, unknown> | null | undefined,
  opts: { styleWithheld?: boolean } = {},
): boolean {
  return ungroundedStylePhrases(text, context, opts).length === 0;
}
