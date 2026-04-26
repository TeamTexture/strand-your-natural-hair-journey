import type { Topic } from "../types.ts";

// Sourced from How To Love Your Afro, Chapter 8 ("Diet and Nutrition"),
// pp 112–116. The book covers iron and ferritin in detail (handled
// separately in iron-and-shedding.ts) and mentions vitamin D in passing
// via oily fish (p 116). Other micronutrients (B12, zinc, magnesium)
// are NOT explicitly covered in the book — when these come up, the
// body defers to GP per persona rather than improvising clinical content.

export const VITS_AND_MINERALS: Topic = {
  id: "vits-and-minerals",
  title: "Vitamins and Minerals (Vitamin D and the Adjacent Micronutrients)",
  body: `The book's primary nutritional argument is varied-diet-first: hair isn't just a single material, it's a complex structure that requires specific nutrients for proper formation and maintenance, and there isn't one miracle nutrient that guarantees healthy hair. A balanced intake of various vitamins, minerals, protein and healthy fats is essential, and nutrients work together — iron with vitamin C, omega-3s with cell turnover, protein for keratin synthesis. Iron and ferritin are deep-covered in the iron-and-shedding topic; this one handles the rest.

Vitamin D — what the book says directly:

Oily fish (salmon, tuna, mackerel, sardines) is a natural source of vitamin D, which plays a role in cell turnover and hair follicle function. The book pairs this with omega-3s — both come from the same dietary sources. For people who don't eat fish, the book names plant-based omega sources: flaxseeds, chia seeds, walnuts, hemp seeds, seaweed and algae (the only plant-based source of EPA and DHA), and canola oil.

For darker skin tones in higher-latitude environments like the UK, vitamin D is a recurring clinical concern in the wider community. The book's framing: when vitamin D shows as low on a blood test, the dermatologist or GP is the right place for interpretation and supplementation guidance — not STRAND.

Other micronutrients (B12, zinc, magnesium):

How To Love Your Afro does not cover B12, zinc or magnesium clinically. STRAND's framing when these appear in a user's blood results:

— Acknowledge the marker accurately by name and status.
— Reference the book's general principle that varied diet supports varied micronutrients.
— Defer dosing, supplementation timing, and interpretation to the user's GP — every expert quoted in the book makes the same point, including Dr Yvonne Abimbola's note that ferritin supplements warrant a GP consult first. The same caution extends to other supplements.

Practical food pointers from the book:

— Protein-rich foods build the keratin in your hair: meat, fish, dairy, eggs, legumes, tofu, nuts, seeds, quinoa, brown rice.
— Hydration matters: hair contains a significant amount of water, and dehydration leaves the scalp and hair brittle.
— Filter your water if you can — some water sources contain bacteria, viruses, chemicals or heavy metals that affect health benefits.
— Iron from plant sources is absorbed better when paired with vitamin C (citrus, strawberries, peppers).

When in doubt, the book's pattern is: name the food, name the mechanism, name the marker if relevant, refer to a professional for anything medical.`,
  applies_to: {
    blood_markers: [
      "Vitamin D",
      "vitamin_d",
      "vitamin D",
      "Vitamin B12",
      "B12",
      "Zinc",
      "zinc",
      "Magnesium",
      "magnesium",
      "Folate",
      "folate",
    ],
    function_kinds: ["blood-ai-summary", "nutrition-plan"],
  },
  book_refs: [
    {
      chapter: 8,
      chapter_title: "Your Hair – The Basics",
      page_start: 112,
      page_end: 116,
    },
  ],
  tags: [
    "vitamin-d",
    "omega-3",
    "micronutrients",
    "B12",
    "zinc",
    "magnesium",
    "varied-diet",
    "vitamin-c-pairing",
    "defer-to-GP",
  ],
};
