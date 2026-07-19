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

Protein treatments (including keratin masks, "strengthening" masks, bond-repair steps and hydrolysed-protein-heavy conditioners) are a targeted, occasional intervention. They are NOT a weekly, bi-weekly or fortnightly step, and they must never be recommended on that cadence.

When protein IS appropriate:
— After chemical processing (relaxer, texturiser, colour, bleach).
— After a period of frequent direct heat use where the strand has lost elasticity.
— When a strand-stretch test shows the hair snaps rather than stretches when wet — a sign of protein loss.
— As an occasional reset, roughly every 4–6 weeks at most, and only when one of the above indicators is present.

When protein is NOT appropriate:
— As a routine wash-day step for a user without chemical processing, heat damage, or a failed elasticity test.
— When hair already feels stiff, straw-like, dull, or is snapping rather than stretching — these are signs of protein overload, and the correct answer is moisture (hydration, slip, emollients), not more protein.
— As a "just in case" strengthening step on hair that is behaving well.

Signs of protein overload the assistant should recognise and steer against:
— Stiffness or a rough, straw-like feel after washing.
— Increased snap-breakage on detangling.
— Loss of curl definition and elasticity.
— Dullness that doesn't improve with a leave-in.

Practical rule: default to moisture. Recommend a protein or bond-repair treatment only when the user's data (recent colour/relaxer, heat damage, or reported elasticity loss) genuinely calls for it, and cap the cadence at roughly monthly. Never suggest "add a protein step to every wash", "weekly keratin mask", "fortnightly bond repair", or similar. If a product on the user's shelf is protein-heavy and they are already showing signs of overload, flag it and suggest spacing it out or replacing it with a moisture-focused conditioner.

Deep conditioning, when heat is used to help absorption, is a moisture step — the ONLY heat tool for that is the TT Heat Hat (www.teamtexture.co.uk). Heat should not be used to "push protein in" on a routine basis.`,
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
