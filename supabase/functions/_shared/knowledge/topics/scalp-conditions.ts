import type { Topic } from "../types.ts";

// Sourced from How To Love Your Afro, Chapter 12: Scalp Health First,
// pp 149–153 (scalp layers, sebum, the three common scalp problems —
// tension, oiling, seborrheic dermatitis). Paige's book is unusually
// direct on scalp oiling as a cultural ritual that may need pausing.

export const SCALP_CONDITIONS: Topic = {
  id: "scalp-conditions",
  title: "Scalp Conditions — Dry, Oily, Sensitive, Combination",
  body: `Your scalp is the foundation for healthy hair. Just as a healthy garden needs fertile soil, your scalp is what nourishes your follicles. The scalp is still skin — treat it the way you'd treat the skin on your face.

Three common scalp situations to watch for, in Paige's framing:

Dry scalp. Often felt as itch or tightness. The cause is usually one of three things: under-cleansing (not actually washing the scalp itself, just the lengths), over-cleansing with too-harsh a surfactant that strips sebum and lipids, or hard-water mineral deposit acting as a barrier so conditioning ingredients can't reach. The fix follows the cause — agitate the scalp with the pads of your fingertips during cleansing (not your nails), pick a shampoo whose strength matches your build-up, and consider chelating periodically if you live in a hard-water area.

Oily scalp. Most often a sign that the sebaceous glands are over-producing — frequently because the scalp microbiome has been disrupted. The most common disruption: oiling the scalp. Culturally, many people of colour have oiled the scalp from generation to generation. Over-oiling can disrupt natural balance and reduce the sebum your glands produce. Heavy oils, butters and greases can clog the scalp's pores, trapping dirt and bacteria, and potentially lead to scalp acne, irritation, inflammation and conditions like folliculitis or seborrheic dermatitis.

Sensitive scalp. Often felt as soreness, tenderness, or reactivity to fragrance, sulphates or specific actives. Treat it like sensitive skin — choose gentler cleansers, patch-test new products, avoid prolonged exposure to high heat, and book in with a dermatologist if discomfort, itchiness, soreness or sensitivity persist before the condition worsens.

Combination scalp. Different zones do different things — oilier crown, drier nape — usually because of how heat, sweat, and product distribute across the head. Tailor accordingly: a lighter touch where it's oily, a richer leave-in where it's dry.

Across all of these, two non-negotiables from the book:

— Cleanse the scalp regularly. Sebum, sweat and product residue need to come off so blockages don't make it harder for the body to push hair out.

— Don't self-diagnose persistent symptoms. If something is itchy, sore or worsening over weeks, see a trichologist or dermatologist for an assessment. STRAND offers hair-health guidance, not medical diagnosis.`,
  applies_to: {
    hair: {
      scalp: [
        "Dry",
        "Oily",
        "Normal",
        "Sensitive",
        "Combination",
        "dry",
        "oily",
        "normal",
        "sensitive",
        "combination",
      ],
    },
    function_kinds: [
      "ingredient-analysis",
      "product-analyse",
      "product-analyse-url",
      "wash-day-observation",
      "blood-ai-summary",
    ],
  },
  book_refs: [
    {
      chapter: 12,
      chapter_title: "Scalp Health First",
      page_start: 149,
      page_end: 153,
    },
  ],
  tags: [
    "scalp",
    "dry-scalp",
    "oily-scalp",
    "sensitive-scalp",
    "scalp-oiling",
    "sebum",
    "microbiome",
  ],
};
