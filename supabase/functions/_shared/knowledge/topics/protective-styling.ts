import type { Topic } from "../types.ts";

// Sourced from How To Love Your Afro, Chapter 11: Styling: Best
// Practices, pp 141–148. Paige's framing on what "protective styling"
// actually means is direct and corrective — the term has been overused
// and misused. The high-tension / low-tension axis is the real
// distinction, not the visual style.

export const PROTECTIVE_STYLING: Topic = {
  id: "protective-styling",
  title: "Protective Styling — Tension, Manipulation, Length Retention",
  body: `What does it actually mean to wear a protective style? The term is incorrectly used far too often in the Afro and curly-haired community, and the book is direct on this: a style that protects your hair shouldn't cause any breakage, damage or tension to your hair and scalp whatsoever. The visual category — braids, locs, weaves — doesn't determine whether a style is protective. The execution does.

Two real axes:

High-manipulation styling involves drastic or frequent changes, manipulation and handling of natural hair. Some manipulation is unavoidable, but excessive manipulation hinders growth and length retention. Heat styling at high temperatures, multiple chemical services, daily re-styling, layering many heavy products, and constant brushing all count.

High-tension styling creates excessive pulling force on the scalp and hair follicles. This is the more dangerous axis. Constant pulling at the roots can lead to the kind of scalp problems Paige experienced herself — traction alopecia chief among them.

Common high-tension culprits the book names directly:

— Braided hairstyles where natural hair is pulled too tightly at the scalp to create the braids. Even styles classed as "protective" — knotless braids, faux locs — can create high-tension points if the technique doesn't distribute tension evenly. Adding extension hair adds weight; weight adds tension.

— Locs and faux-loc extensions installed with aggressive pulling, tight interlocking, or partings too small to support the weight of grown locs. The book is direct that the same risks apply to faux-loc extensions, where the natural hair is pulled tightly into the extensions on install. Synthetic fibres rubbing against the cuticle can dehydrate, damage and break the strand.

— Wigs and weaves over tight cornrow bases. Wig combs gripping the roots, chemical glues around the perimeter worn for days or weeks, and improper removal compound the damage. Many people who wear these styles experience hair loss for these reasons.

— High ponytails scraped into place with bristle brushes, heavy gels and edge-control products. Tension at the hairline plus drying gels plus coarse-bristle dragging is a triple penalty.

Low-manipulation, low-tension alternatives the book explicitly endorses:

— Wearing your Afro in its natural state with a light leave-in or curl cream. One of the lowest-manipulation, lowest-tension styles there is.
— Wash-and-go styles. Apply styler at wash, let the hair rest practically untouched until next wash.
— Braid-outs and twist-outs from your own hair (no extensions, no aggressive base tension).
— Two- and three-strand twists, flat twists, comb / finger coils with twisting cream or styling foam.
— Bantu knots, with attention to how much tension is applied at the base.
— Loose braids, cornrows, chunky single plaits, French braids — large parts, no extensions, never pulled tight at the hairline.
— Looser satin, silk-lined turbans and headwraps for variation without scalp pressure.

The principle: a protective style should support hair health by minimising breakage, damage and tension — not causing them. When a user logs a takedown, an install, or a long-running protective style, that framing is the lens for the AI's response.`,
  applies_to: {
    function_kinds: [
      "wash-day-observation",
      "ingredient-analysis",
      "product-analyse",
      "product-analyse-url",
      "heat-treatment-rationale",
    ],
  },
  book_refs: [
    {
      chapter: 11,
      chapter_title: "Styling: Best Practices",
      page_start: 141,
      page_end: 148,
    },
  ],
  tags: [
    "protective-styling",
    "tension",
    "manipulation",
    "braids",
    "locs",
    "knotless",
    "wigs",
    "edges",
    "length-retention",
    "traction-alopecia",
  ],
};
