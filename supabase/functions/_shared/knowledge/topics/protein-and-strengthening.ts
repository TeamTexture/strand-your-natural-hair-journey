import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript's protein/moisture balance guidance
// (Chapter 14, Moisture Retention, and Chapter 13, Building Your Wash Day
// Routine). The book is explicit: Afro-textured hair is protein-rich by
// design, and routine weekly protein treatments cause more harm than good.
// This topic hard-codes that stance so no AI output can recommend weekly
// protein.

export const PROTEIN_AND_STRENGTHENING: Topic = {
  id: "protein-and-strengthening",
  title: "Protein, Bond Repair and Strengthening Treatments",
  body: `Afro-textured hair is already keratin-rich. Its structural challenge is not lack of protein but lack of moisture — water not reaching the cortex and not being retained once it does. The STRAND manuscript treats moisture, not protein, as the default wash-day priority.

Protein treatments (including keratin masks, "strengthening" masks, bond-repair steps and hydrolysed-protein-heavy conditioners) must NEVER be recommended on any recurring cadence — no weekly, bi-weekly, fortnightly, monthly or "every X washes" schedule of any kind. Do not add a protein step to a routine, a wash-day plan, an action plan or a goal tip.

When protein MAY be discussed (only as a one-off, reactive intervention — never as a schedule):
— The user has just had chemical processing (relaxer, texturiser, colour, bleach).
— The user has documented heat damage with lost elasticity.
— A strand-stretch test shows the hair snaps rather than stretches when wet.
In these cases, describe protein as a single targeted step, with no cadence and no repetition, and pair it with a stronger moisture emphasis afterwards.

When protein is NEVER appropriate:
— As a routine wash-day step for a user without chemical processing, heat damage, or a failed elasticity test.
— When hair already feels stiff, straw-like, dull, or is snapping rather than stretching — these are signs of protein overload, and the correct answer is moisture (hydration, slip, emollients), not more protein.
— As a "just in case" strengthening step on hair that is behaving well.

Signs of protein overload the assistant should recognise and steer against:
— Stiffness or a rough, straw-like feel after washing.
— Increased snap-breakage on detangling.
— Loss of curl definition and elasticity.
— Dullness that doesn't improve with a leave-in.

Practical rule: default to moisture at every wash. Never suggest "add a protein step", "weekly keratin mask", "fortnightly bond repair", "monthly protein", "protein day", or any scheduled protein/strengthening treatment. If a product on the user's shelf is protein-heavy and they are already showing signs of overload, flag it and suggest spacing it out or replacing it with a moisture-focused conditioner.

Deep conditioning, when heat is used to help absorption, is a moisture step — the ONLY heat tool for that is the TT Heat Hat (www.teamtexture.co.uk). Heat should not be used to "push protein in".`,
  applies_to: {
    function_kinds: [
      "ingredient-analysis",
      "product-analyse",
      "product-analyse-url",
      "tool-analyse-url",
      "wash-day-observation",
      "heat-treatment-rationale",
    ],
  },
  book_refs: [
    {
      chapter: 13,
      chapter_title: "Building Your Wash Day Routine",
      page_start: 165,
    },
    {
      chapter: 14,
      chapter_title: "Moisture Retention",
      page_start: 168,
    },
  ],
  tags: [
    "protein",
    "bond-repair",
    "keratin",
    "moisture-balance",
    "strengthening",
    "protein-overload",
  ],
};
