// Single source of truth for hairstyle options and their conditional style
// attributes (tension + extensions). Every style picker in the app imports
// from here — onboarding, Set current style, planned next style and the
// profile review screens — so the option list can never drift between
// surfaces.

export type StyleTension = "low" | "high";

export interface StyleGroup {
  /** Small eyebrow heading shown above the chips. */
  label: string;
  options: string[];
}

export const STYLE_GROUPS: StyleGroup[] = [
  {
    label: "Worn out",
    options: [
      "Loose natural",
      "TWA",
      "Wash and go",
      "Twist-out",
      "Braid-out",
      "Finger comb coils",
      "Bantu knots",
      "Bantu knot-out",
      "Afro puff",
    ],
  },
  {
    label: "Updos",
    options: [
      "Low natural ponytail",
      "High natural ponytail",
      "Low bun",
      "High bun",
    ],
  },
  {
    label: "Twists and braids",
    options: [
      "Flat twists",
      "Two-strand twists",
      "Mini twists",
      "Passion / rope twists",
      "Box braids",
      "Knotless braids",
      "Cornrows",
    ],
  },
  {
    label: "Locs",
    options: ["Faux locs", "Locs"],
  },
  {
    label: "Added hair",
    options: ["Wig / unit", "Weave / sew-in", "Crochet braids"],
  },
  {
    label: "Chemically treated",
    options: ["Silk press", "Relaxed", "Texturised", "Curly perm"],
  },
];

export const NOT_SURE_YET = "Not sure yet";

/** Flat list, group order preserved, with "Not sure yet" last. */
export const HAIRSTYLE_OPTIONS: string[] = [
  ...STYLE_GROUPS.flatMap((g) => g.options),
  NOT_SURE_YET,
];

/** Styles that ask how tight the style feels at the roots and edges. */
export const TENSION_STYLES: string[] = [
  "Low natural ponytail",
  "High natural ponytail",
  "Low bun",
  "High bun",
  "Afro puff",
  "Box braids",
  "Knotless braids",
  "Cornrows",
  "Flat twists",
  "Two-strand twists",
  "Mini twists",
  "Passion / rope twists",
  "Faux locs",
  "Crochet braids",
  "Weave / sew-in",
];

/**
 * Styles that ask whether extensions were added. Wig / unit, Weave / sew-in and
 * Crochet braids already imply added hair, so they are deliberately absent.
 */
export const EXTENSION_STYLES: string[] = [
  "Low natural ponytail",
  "High natural ponytail",
  "Low bun",
  "High bun",
  "Afro puff",
  "Box braids",
  "Knotless braids",
  "Cornrows",
  "Two-strand twists",
  "Mini twists",
  "Passion / rope twists",
  "Faux locs",
  "Bantu knots",
];

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export const styleAsksTension = (style: string | null | undefined): boolean =>
  TENSION_STYLES.some((s) => norm(s) === norm(style));

export const styleAsksExtensions = (style: string | null | undefined): boolean =>
  EXTENSION_STYLES.some((s) => norm(s) === norm(style));

export const TENSION_HELPER = "How tight does it feel at your roots and edges?";

export const TENSION_CHOICES = [
  { value: "low", label: "Low tension" },
  { value: "high", label: "High tension" },
];

export const EXTENSION_CHOICES = [
  { value: "yes", label: "With extensions" },
  { value: "no", label: "Without extensions" },
];

/** Human phrasing used in AI context and passport-style read-outs. */
export function describeStyleAttributes(
  tension: string | null | undefined,
  extensions: boolean | null | undefined,
): string {
  const bits: string[] = [];
  if (tension === "low") bits.push("low tension");
  if (tension === "high") bits.push("high tension");
  if (extensions === true) bits.push("with extensions");
  if (extensions === false) bits.push("without extensions");
  return bits.join(", ");
}
