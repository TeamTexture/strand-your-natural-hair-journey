import type { Topic } from "../types.ts";

// Sourced from How To Love Your Afro, Chapter 13: Building Your Wash Day
// Routine, pp 158–159 (chelating shampoos, hard-water mineral build-up).
// The book is direct on hard water as a physical barrier on the hair
// shaft and gives the postcode-look-up tip Paige uses in practice.

export const HARD_WATER: Topic = {
  id: "hard-water",
  title: "Hard Water — Mineral Build-up and Chelation",
  body: `Hard water deposits minerals (calcium, magnesium, sometimes copper, iron and chlorine residue) onto the hair shaft. The book is direct: hard-water minerals build up on hair, making it feel stiff, dull, and difficult to manage, while also acting as a barrier preventing products from working or moisture from penetrating effectively. The user can be doing everything right — good shampoo, good conditioner, good leave-in — and the curls still feel heavy, dry, or weirdly product-resistant. That barrier is the cause.

How to know:

— Postcode lookup. The book's practical tip: type your postcode into Google followed by "water hardness" and the name of your area. Several websites offer this. STRAND already does this server-side via the hardWaterPostcodes data file when the user has set their postcode.
— Behaviour pattern. If hair takes longer than usual to wet down, stops reacting to styling products in the way it normally does, or curls feel heavy, tacky or even greasy to the touch, that's the same kind of build-up signal the book describes — clarifying-shampoo territory.

How to break it: chelation.

Chelating shampoos are generally considered the strongest cleansers. They cleanse oil, dirt, debris and product build-up, and they also remove minerals, metals and chlorine that hard water deposits. Chelation is the chemical process of grabbing those mineral ions and rinsing them away. EDTA, citric acid and disodium EDTA are common chelators in formulation.

How not to break it:

— Don't chelate every wash. The book is direct that the use of a cleanser this strong too often could cause serious damage to your curls. Seek professional advice on whether you actually need a chelating treatment.
— Different chelating shampoos sit at different strengths. A gentle chelating clarifier (Olaplex 4C is referenced as an example by Gaia Tonanzi of Tootilab) is not the same as a deep-strength salon chelator.
— The marketing labels "clarifying" and "detox" are interchangeable and not industry-standard terms. Read what the bottle is actually trying to do — what build-up does it target.

A reasonable cadence the book and the experts quoted in it suggest: not weekly. Every 4–5 washes is the rough rhythm Tootilab's Gaia Tonanzi names, "or when your hair feels heavy, greasy, or like your usual products are no longer working".

Daily-life pointers from the book:

— A home water filter further purifies your drinking water. Some people also install a shower filter for hair-rinse water; the book doesn't make a specific shower-filter recommendation but discusses the broader water-quality framing.
— Hard water also affects what conditioner can do — moisture can't penetrate through a mineral film. So the chelating cleanse before deep conditioning is what unlocks the conditioner.

If a user's postcode is in a hard-water area AND they have not used any clarifying or chelating step in their last few wash logs, that's a real, well-founded thing to flag.`,
  applies_to: {
    location: { hard_water: true },
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
      chapter: 13,
      chapter_title: "Building Your Wash Day Routine",
      page_start: 158,
      page_end: 159,
    },
  ],
  tags: [
    "hard-water",
    "chelation",
    "EDTA",
    "build-up",
    "clarifying",
    "minerals",
    "UK-specific",
  ],
};
