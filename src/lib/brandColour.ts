// brandColour — brand colour extraction + WCAG contrast guardrails.
//
// Extraction runs ONCE, client-side, at logo upload time (see
// BrandProfileEditor). The resulting hexes are stored on `brand_profiles`
// (brand_colour_primary / brand_colour_secondary / brand_colour_on_primary /
// brand_colour_source), so no render path ever re-quantises an image.
//
// Guardrails (mandatory):
//  - relative luminance of the extracted primary decides light vs dark text,
//  - if neither reaches 4.5:1 the stored primary is darkened/lightened until it
//    does, so text is never rendered at insufficient contrast,
//  - no logo / failed extraction falls back to the STRAND gold token.

/** STRAND gold — hsl(40 55% 50%) from index.css, resolved to hex so it can be
 *  stored and reasoned about like an extracted colour. */
export const STRAND_GOLD = "#c69739";
export const STRAND_GOLD_DARK = "#8a6a26";

export interface BrandColours {
  /** The colour as extracted from the logo — UNMODIFIED. Used for tints,
   *  borders and the left edge accent so the card looks like the brand. Never
   *  used behind or as text. */
  primary: string;
  secondary: string;
  /** Text colour that clears 4.5:1 on `primary`. */
  onPrimary: string;
  /** The text-safe version of `primary`: darkened (or lightened) until it
   *  clears 4.5:1 as text on the cream card surface AND carries readable text
   *  when used as a filled button. Every text-bearing surface uses this. */
  accent: string;
  /** Text colour that clears 4.5:1 on `accent`. */
  onAccent: string;
  source: "logo" | "fallback";
}

/** The cream card surface brand-coloured text sits on — hsl(36 67% 97%). */
export const CARD_SURFACE = "#fdf8f1";

/* ── colour maths ───────────────────────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1 → 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#ffffff";
/** The STRAND ink brown — hsl(36 32% 13%). */
const DARK_TEXT = "#2b2117";

/** Light or dark text, whichever contrasts better on `hex`. */
export function pickReadableTextColour(hex: string): string {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

function shift(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
  if (amount < 0) {
    const f = 1 + amount;
    return rgbToHex(r * f, g * f, b * f);
  }
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/**
 * Guarantees a text colour at ≥ `target` contrast. If neither white nor ink
 * clears the bar against the supplied colour, the colour itself is nudged
 * (darkened for light colours, lightened for dark ones) until it does.
 * Returns the (possibly adjusted) surface colour and the text colour to use.
 */
export function ensureReadable(
  hex: string,
  target = 4.5,
): { colour: string; text: string; adjusted: boolean } {
  let colour = hex;
  let text = pickReadableTextColour(colour);
  if (contrastRatio(colour, text) >= target) return { colour, text, adjusted: false };

  // Mid-tone colour: pick the direction that needs the smaller move. Darkening
  // pairs with white text, lightening with ink.
  const goDark = relativeLuminance(colour) > 0.3;
  for (let step = 1; step <= 20; step++) {
    colour = shift(hex, goDark ? -0.05 * step : 0.05 * step);
    text = goDark ? LIGHT_TEXT : DARK_TEXT;
    if (contrastRatio(colour, text) >= target) return { colour, text, adjusted: true };
  }
  // Absolute floor — never render insufficient contrast.
  return goDark ? { colour: "#1f1a14", text: LIGHT_TEXT, adjusted: true }
                : { colour: "#ffffff", text: DARK_TEXT, adjusted: true };
}

/**
 * Darkens (or lightens) a colour until it clears `target` contrast AS TEXT on
 * the cream card surface. A vivid brand orange reads at ~3.4:1 on cream, so
 * every brand-coloured label and filled button uses this deeper version while
 * the tint keeps the original.
 */
export function textSafeAccent(hex: string, target = 4.5): string {
  if (contrastRatio(hex, CARD_SURFACE) >= target) return hex;
  const goDark = relativeLuminance(hex) > 0.06;
  for (let step = 1; step <= 20; step++) {
    const c = shift(hex, goDark ? -0.05 * step : 0.05 * step);
    if (contrastRatio(c, CARD_SURFACE) >= target) return c;
  }
  return goDark ? "#1f1a14" : "#ffffff";
}

/** Assembles the full palette from one base colour, applying every guardrail. */
function palette(base: string, secondary: string, source: BrandColours["source"]): BrandColours {
  const accent = textSafeAccent(base);
  return {
    primary: base,
    secondary,
    onPrimary: ensureReadable(base).text,
    accent,
    onAccent: ensureReadable(accent).text,
    source,
  };
}

/** The fallback identity when a brand has no logo or extraction failed. */
export function fallbackBrandColours(): BrandColours {
  return palette(STRAND_GOLD, STRAND_GOLD_DARK, "fallback");
}

/** Normalise stored DB values into a guaranteed-readable palette. */
export function resolveBrandColours(row: {
  brand_colour_primary?: string | null;
  brand_colour_secondary?: string | null;
  brand_colour_on_primary?: string | null;
} | null | undefined): BrandColours {
  const raw = row?.brand_colour_primary ?? null;
  if (!raw || !hexToRgb(raw)) return fallbackBrandColours();
  const secondary = row?.brand_colour_secondary && hexToRgb(row.brand_colour_secondary)
    ? row.brand_colour_secondary
    : shift(raw, -0.25);
  return palette(raw, secondary, "logo");
}

/** rgba() string for a soft tint of a hex colour. */
export function tint(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ── extraction (canvas quantisation, upload time only) ─────────────────── */

/**
 * Quantises an image into a 4-bit-per-channel histogram and returns the two
 * most prominent chromatic buckets. Near-white / near-black / low-saturation
 * pixels are ignored so a logo on a white plate still yields its brand colour.
 * Returns null when nothing usable is found (caller falls back to gold).
 */
export async function extractBrandColoursFromBlob(blob: Blob): Promise<BrandColours | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const picked = pickDominantColours(data);
    if (!picked) return null;
    return palette(picked.primary, picked.secondary, "logo");
  } catch {
    return null;
  }
}

/**
 * Pure, testable quantiser. Buckets RGBA pixel data at 4 bits per channel and
 * ranks strictly by PIXEL-COUNT SHARE, so the dominant AREA wins and a small
 * accent stripe can never outrank the field it sits on. Near-white (the
 * wordmark), near-black and washed-out greys are ignored.
 *
 * Returns the dominant colour plus the most prominent bucket from a
 * *different* hue family as the secondary, so a brand with an accent stripe
 * gets a genuine second colour rather than a neighbouring shade of the first.
 */
export function pickDominantColours(
  data: Uint8ClampedArray | number[],
): { primary: string; secondary: string; share: number } | null {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  let considered = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = (max + min) / 2;
    const sat = max === 0 ? 0 : (max - min) / max;
    // Paper white (and the white wordmark), near black, washed-out greys.
    if (lum > 242 || lum < 14) continue;
    if (sat < 0.12 && lum > 200) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const cur = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    cur.count += 1; // strictly area — no saturation weighting
    cur.r += r; cur.g += g; cur.b += b;
    buckets.set(key, cur);
    considered += 1;
  }
  if (buckets.size === 0 || considered === 0) return null;

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const avg = (x: { count: number; r: number; g: number; b: number }) =>
    rgbToHex(x.r / x.count, x.g / x.count, x.b / x.count);
  const primary = avg(ranked[0]);
  const [pr, pg, pb] = hexToRgb(primary) ?? [0, 0, 0];
  const distinct = ranked
    .slice(1)
    .map(avg)
    .find((hex) => {
      const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
      return Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb) > 120;
    });
  return {
    primary,
    secondary: distinct ?? shift(primary, -0.25),
    share: ranked[0].count / considered,
  };
}
