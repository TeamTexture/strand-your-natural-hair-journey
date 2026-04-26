import type { Topic } from "../types.ts";

// SAFETY NOTE: How To Love Your Afro covers stress hormones explicitly
// in Ch 2 (p 41 — stress hormones disrupt the hair cycle and push hairs
// into telogen / shedding phase) and references hormonal imbalances
// generally in Ch 10 (p 136 — curl specialists as a first line of
// defence against identifying them). Specific life-stage clinical
// content (perimenopause, menopause, postpartum recovery, hormonal
// contraception, pregnancy as a hair-affecting state) is NOT in the
// book. This topic body is grounded in what the book DOES cover and
// defers everything else to GP/dermatologist per persona.

export const HORMONES_AND_LIFE_STAGE: Topic = {
  id: "hormones-and-life-stage",
  title: "Hormones and Life Stage (Stress, Cycles, Pregnancy, Perimenopause)",
  body: `Hormonal life stage shows up in STRAND's clinical data — pregnancy, postpartum, perimenopause, menopause, hormonal contraception. How To Love Your Afro is not a clinical hormone manual, and it doesn't try to be. The book's framing on hormones is two specific points:

Stress hormones can disrupt the hair growth cycle. The book is explicit on this in Chapter 2 — stress hormones can push more hair than normal into the telogen (resting / shedding) phase, which is the underlying mechanism of telogen effluvium. This is one of the few places where the book directly connects a physiological state to a named hair-loss pattern.

Curl specialists are a first line of defence. From Chapter 10 (p 136): "Many times curl specialists can also be our first line of defence against the identification of serious medical conditions before we even know they exist. Our hair and scalp can communicate everything from hormonal imbalances and vitamin deficiencies to recent sugar binges, all of which could be affecting much more than just the health of our hair." A specialist in textured hair often spots patterns before the user does.

Beyond those two points, the book does not cover:

— Perimenopause / menopause hormonal shifts and hair shedding patterns.
— Postpartum hair loss recovery timelines.
— The hair-affecting profiles of specific hormonal contraceptives (combined pill, mini-pill, IUD hormonal, implant, HRT).
— Pregnancy-specific hair changes.
— Fertility-treatment hair effects.

What this means for STRAND in practice:

When a user's profile shows life_stage = pregnant / postpartum / perimenopausal / menopausal, or names a specific hormonal contraceptive, the AI should:

— Acknowledge the life stage accurately, without over-claiming what STRAND knows about it.
— Adjust hair-care guidance for general principles the book does cover — for example, telogen effluvium awareness during high-stress life stages, the importance of varied nutrition during periods of physiological change, scalp health as the foundation, low-tension styling to protect already-stressed follicles.
— Defer any specific clinical interpretation, supplementation timing, or hormone-related medical advice to the user's GP or dermatologist. The book recommends seeing a dermatologist for blood work where underlying medical conditions might be contributing to hair loss (Ch 9, p 129) — that path is the one for hormonal questions.
— Never recommend stopping prescribed hormonal medication or contraception. Persona boundary, non-negotiable.

When a user has flagged stress, life-event change, or recent emotional load alongside shedding concerns, the book gives one solid hand-hold: telogen effluvium is real, it's often temporary, it tends to follow a stressor by a few months, and the wider picture is worth a GP conversation rather than a styling change.`,
  applies_to: {
    health: {
      life_stage: [
        "Pregnant",
        "Postpartum",
        "Perimenopause",
        "Menopause",
        "pregnant",
        "postpartum",
        "perimenopause",
        "menopause",
      ],
      conditions: [
        "Hormonal pill",
        "IUD hormonal",
        "Implant",
        "HRT",
        "Fertility treatment",
        "PCOS",
        "Endometriosis",
        "Chronic stress / anxiety",
      ],
    },
    function_kinds: [
      "blood-ai-summary",
      "nutrition-plan",
      "wash-day-observation",
      "ingredient-analysis",
    ],
  },
  book_refs: [
    {
      chapter: 2,
      chapter_title: "Learning to Love Your Natural Hair",
      page_start: 41,
    },
    {
      chapter: 10,
      chapter_title: "Partner with a Professional",
      page_start: 136,
    },
  ],
  tags: [
    "hormones",
    "telogen-effluvium",
    "stress",
    "perimenopause",
    "menopause",
    "postpartum",
    "pregnancy",
    "contraception",
    "defer-to-GP",
    "safety-critical",
  ],
};
