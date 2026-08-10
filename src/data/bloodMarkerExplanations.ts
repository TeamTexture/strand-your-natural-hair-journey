// Plain-English explanations for each blood marker STRAND tracks.
//
// Content rules (author-set, non-negotiable):
//  - Grounded in How To Love Your Afro, Chapter 8: Diet and Nutrition (pp 112–116).
//  - Food first. Never push supplements, never mention injections, infusions,
//    dosing or any clinical treatment — that is a doctor's conversation only.
//  - Never name who is "more at risk" (no vegans, no older adults, no groups).
//    State what the marker is, where the nutrient is found in food, and what a
//    low reading can mean — nothing about who should worry.
//  - Every nutrient carries plant-based options so vegan and vegetarian members
//    are accounted for, not treated as an afterthought.
//
// Surfaces on the Blood Panel Review page as expandable dropdowns.

export type DietType = "vegan" | "vegetarian" | "omnivore" | "unknown";

export interface MarkerExplanation {
  what: string; // one-sentence "what this measures"
  whyItMatters: string; // one-sentence hair relevance
  /** Plant-based sources — shown to everyone. */
  plantFoods?: string[];
  /** Dairy and eggs — shown to vegetarians and omnivores. */
  vegetarianFoods?: string[];
  /** Meat, fish and shellfish — shown to omnivores only. */
  animalFoods?: string[];
  /** What a low reading can mean, including for hair. Non-diagnostic. */
  ifLow?: string;
  /** What a high reading can mean. Non-diagnostic. */
  ifHigh?: string;
}

/** The one caution the author wants attached to every nutrient marker. */
export const FOOD_FIRST_NOTE =
  "Food comes first. How To Love Your Afro makes the case for building these nutrients into a varied everyday diet as the goal, rather than reaching for supplements — and anything beyond food is a conversation for your GP, not for STRAND.";

/** The manuscript anchor for this whole section. */
export const NUTRITION_BOOK_REF =
  "Read more — How To Love Your Afro, Chapter 8: Diet and Nutrition, pp.112–116";

/** Food list for a member, filtered by their diet type. */
export function foodsForDiet(
  info: MarkerExplanation | undefined,
  diet: DietType,
): string[] {
  if (!info) return [];
  const out = [...(info.plantFoods ?? [])];
  if (diet === "vegetarian" || diet === "omnivore" || diet === "unknown") {
    out.push(...(info.vegetarianFoods ?? []));
  }
  if (diet === "omnivore" || diet === "unknown") {
    out.push(...(info.animalFoods ?? []));
  }
  return out;
}

export const MARKER_EXPLANATIONS: Record<string, MarkerExplanation> = {
  // Iron & storage
  Ferritin: {
    what: "Ferritin is your body's iron storage tank — the amount of iron you have held in reserve.",
    whyItMatters:
      "The book covers iron in detail because hair follicles draw on iron stores, and low stores are one of the most common findings behind increased shedding in women.",
    plantFoods: [
      "lentils, chickpeas and beans",
      "tofu and tempeh",
      "pumpkin seeds, sesame seeds and cashews",
      "dark leafy greens like spinach and kale",
      "fortified cereals and oats",
      "dried apricots and figs",
      "pair any of these with vitamin C — citrus, peppers, strawberries — which the book notes improves absorption from plant sources",
    ],
    vegetarianFoods: ["eggs"],
    animalFoods: ["red meat", "sardines and other oily fish", "shellfish"],
    ifLow: "Low iron stores are associated with more shedding and slower, weaker regrowth, and often show up alongside tiredness. It's a result worth taking to your GP so they can interpret it properly.",
    ifHigh: "Raised ferritin can reflect a number of things, including inflammation. Your GP is the right person to look into it.",
  },
  "Serum Iron": {
    what: "The amount of iron circulating in your blood at the moment the sample was taken.",
    whyItMatters:
      "A single snapshot rather than the full picture — it reads best alongside ferritin and transferrin saturation.",
    plantFoods: ["lentils and beans", "tofu", "pumpkin and sesame seeds", "dark leafy greens", "fortified cereals"],
    vegetarianFoods: ["eggs"],
    animalFoods: ["red meat", "oily fish", "shellfish"],
    ifLow: "Less iron in circulation on the day. On its own it says little, so read it with ferritin and take the pattern to your GP.",
    ifHigh: "Can simply reflect timing around iron-rich food or a recent meal. Your GP can put it in context.",
  },
  TIBC: {
    what: "Total Iron Binding Capacity — how much iron your blood is able to carry.",
    whyItMatters:
      "It tends to rise when the body is trying to capture more iron, which is why it's read alongside ferritin.",
    ifLow: "Usually interpreted alongside your other iron markers rather than alone. One for your GP.",
    ifHigh: "Often reads as the body seeking more iron, which can accompany depleted stores. Discuss with your GP.",
  },
  "Transferrin Saturation": {
    what: "The percentage of your iron-carrying protein that is actually loaded with iron.",
    whyItMatters:
      "It shows whether iron is available to be used, which is why it sits next to ferritin in the book's iron chapter.",
    ifLow: "Suggests iron isn't as available as it could be, which is part of the picture behind shedding. Take the full iron panel to your GP.",
    ifHigh: "Read alongside ferritin and serum iron by your GP.",
  },

  // Vitamins
  "Vitamin D": {
    what: "A vitamin your skin makes from sunlight, and which also comes from a small number of foods.",
    whyItMatters:
      "How To Love Your Afro notes vitamin D's role in cell turnover and follicle function, and that in a UK climate levels can sit lower than we'd like.",
    plantFoods: [
      "fortified plant milks, yoghurts and cereals",
      "mushrooms grown in UV light",
      "sensible daylight on your skin through the brighter months",
    ],
    vegetarianFoods: ["eggs", "fortified dairy"],
    animalFoods: ["oily fish — salmon, mackerel, sardines, tuna"],
    ifLow: "A low reading is common and is a straightforward conversation to have with your GP, who can advise on what to do next.",
    ifHigh: "High readings are unusual. Your GP can look at why.",
  },
  "Vitamin B12": {
    what: "A vitamin your body uses to make red blood cells and maintain healthy nerves.",
    whyItMatters:
      "It sits in the book's varied-diet argument: B12 supports the red blood cells that carry oxygen to the scalp, and hair is sensitive to that supply.",
    plantFoods: [
      "fortified plant milks and yoghurts",
      "fortified breakfast cereals",
      "nutritional yeast that states it is fortified with B12",
      "some fortified spreads and meat alternatives",
    ],
    vegetarianFoods: ["dairy — milk, cheese, yoghurt", "eggs"],
    animalFoods: ["fish", "meat", "shellfish"],
    ifLow: "A low result can show up as tiredness and increased shedding, because red blood cell production is affected. Your GP is the person to interpret it and decide what happens next.",
    ifHigh: "Usually nothing to act on yourself — your GP can tell you whether it needs looking at.",
  },
  Folate: {
    what: "The natural form of folic acid — your cells use it to divide and renew.",
    whyItMatters:
      "Hair cells are among the fastest-renewing in the body, so the book puts folate-rich foods in the everyday-diet camp.",
    plantFoods: [
      "dark leafy greens — spinach, kale, spring greens",
      "beans, lentils and chickpeas",
      "asparagus, broccoli and Brussels sprouts",
      "avocado",
      "oranges and other citrus",
      "fortified cereals and breads",
    ],
    vegetarianFoods: ["eggs"],
    ifLow: "Low folate can slow the cell turnover that hair growth relies on. Your GP can interpret the result properly.",
    ifHigh: "Generally not something to act on. Mention it at your next GP appointment if you're unsure.",
  },
  "Vitamin A": {
    what: "A vitamin involved in skin, scalp and cell renewal.",
    whyItMatters:
      "Balance is the point here — the scalp is sensitive to both too little and too much, which is why the book favours food over pills.",
    plantFoods: [
      "sweet potato, carrots, butternut squash",
      "dark leafy greens",
      "red peppers and tomatoes",
      "mango and apricots",
    ],
    vegetarianFoods: ["eggs", "dairy"],
    animalFoods: ["oily fish"],
    ifLow: "Can show up in scalp dryness and slower renewal. Food sources are the first place to look; your GP can advise beyond that.",
    ifHigh: "High readings usually come from concentrated sources rather than food. Worth raising with your GP.",
  },
  "Vitamin E": {
    what: "An antioxidant vitamin that helps protect your cells from oxidative stress.",
    whyItMatters: "It supports the scalp environment your hair grows out of.",
    plantFoods: [
      "almonds, hazelnuts and sunflower seeds",
      "avocado",
      "olive, sunflower and rapeseed oil",
      "spinach and broccoli",
      "wheatgerm",
    ],
    ifLow: "Uncommon on a varied diet. The nut, seed and oil sources above are the everyday route in.",
    ifHigh: "Rarely seen from food alone. Your GP can comment if it's flagged.",
  },
  Biotin: {
    what: "A B-vitamin your body uses when building keratin, the protein hair is made from.",
    whyItMatters:
      "The book is deliberately unromantic about biotin: there is no single miracle nutrient, and most varied diets already supply it.",
    plantFoods: ["nuts and seeds", "sweet potato", "oats", "legumes", "avocado"],
    vegetarianFoods: ["eggs", "dairy"],
    animalFoods: ["salmon"],
    ifLow: "A genuinely low result is unusual and worth discussing with your GP rather than self-managing.",
    ifHigh: "High biotin can skew other test results, including thyroid ones — tell whoever ordered your test.",
  },

  // Minerals
  Zinc: {
    what: "An essential mineral used in immune function, repair and follicle turnover.",
    whyItMatters:
      "Zinc sits in the book's varied-diet argument as one of the minerals hair formation draws on.",
    plantFoods: [
      "pumpkin, hemp and sesame seeds",
      "chickpeas, lentils and beans",
      "cashews and almonds",
      "oats and wholegrains",
      "tofu and tempeh",
    ],
    vegetarianFoods: ["cheese", "eggs"],
    animalFoods: ["shellfish", "red meat"],
    ifLow: "Low zinc is associated with shedding, slower growth and an unsettled scalp. Take it to your GP for interpretation.",
    ifHigh: "High zinc can affect how your body handles copper. One for your GP.",
  },
  Magnesium: {
    what: "A mineral involved in hundreds of processes, including sleep and stress regulation.",
    whyItMatters:
      "Stress is a recognised trigger for shedding, and magnesium-rich foods sit in the book's everyday-diet toolkit.",
    plantFoods: [
      "dark leafy greens",
      "pumpkin seeds and almonds",
      "black beans and edamame",
      "wholegrains — brown rice, quinoa, oats",
      "dark chocolate",
    ],
    ifLow: "Low magnesium can show up in sleep and stress patterns, which in turn affect hair. Food sources first; your GP for anything more.",
    ifHigh: "Uncommon from food. Your GP can interpret it.",
  },
  Selenium: {
    what: "A trace mineral used in thyroid function and antioxidant defence.",
    whyItMatters:
      "Thyroid function sets the pace of the hair cycle, and selenium is part of that machinery.",
    plantFoods: [
      "Brazil nuts (one or two a day is plenty)",
      "sunflower seeds",
      "wholegrain bread, brown rice and oats",
      "mushrooms and lentils",
    ],
    vegetarianFoods: ["eggs", "dairy"],
    animalFoods: ["fish"],
    ifLow: "Worth discussing with your GP alongside your thyroid markers.",
    ifHigh: "Selenium is one where more is not better, and excess is linked to hair loss. Raise a high reading with your GP.",
  },
  Copper: {
    what: "A trace mineral your body uses for pigment, connective tissue and enzymes.",
    whyItMatters: "Copper contributes to natural hair pigment and follicle function.",
    plantFoods: [
      "cashews, almonds and sesame seeds",
      "lentils and chickpeas",
      "dark chocolate",
      "mushrooms",
      "wholegrains",
    ],
    animalFoods: ["shellfish"],
    ifLow: "Read alongside zinc by your GP, as the two interact.",
    ifHigh: "Your GP can look at why it's raised.",
  },

  // Inflammation & general
  CRP: {
    what: "A marker of inflammation in the body — it rises when something is inflamed.",
    whyItMatters:
      "The scalp is skin, and an inflamed body can show up as an unsettled scalp.",
    plantFoods: [
      "oily-fish alternatives for omega-3 — flaxseed, chia, walnuts, hemp seeds, seaweed and algae",
      "plenty of vegetables, pulses and wholegrains",
      "filtered water — the book flags hydration and water quality directly",
    ],
    animalFoods: ["oily fish — salmon, mackerel, sardines"],
    ifHigh: "Raised CRP means something is inflamed, not what. Your GP interprets it.",
  },
  "Blood Glucose": {
    what: "The amount of sugar in your bloodstream when the sample was taken.",
    whyItMatters:
      "Persistently high glucose is linked to inflammation, which the scalp can feel.",
    plantFoods: [
      "wholegrains over refined carbohydrates",
      "pulses, nuts and seeds for fibre and fat alongside meals",
      "vegetables at most meals",
    ],
    ifLow: "Mostly only meaningful if you had symptoms at the time. Mention it to your GP.",
    ifHigh: "Your GP will want to see this in context, often alongside HbA1c.",
  },
  Albumin: {
    what: "The main protein in your blood, which reflects general protein and liver status.",
    whyItMatters:
      "Protein builds keratin — the book lists the protein foods hair formation depends on.",
    plantFoods: [
      "legumes — lentils, beans, chickpeas",
      "tofu and tempeh",
      "nuts and seeds",
      "quinoa and brown rice",
    ],
    vegetarianFoods: ["dairy", "eggs"],
    animalFoods: ["meat", "fish"],
    ifLow: "Can reflect protein intake or absorption. Worth reviewing your protein foods and discussing the result with your GP.",
    ifHigh: "Often simply reflects hydration on the day.",
  },
  HbA1c: {
    what: "Your average blood sugar over roughly the last three months.",
    whyItMatters:
      "A longer view than a single glucose reading, and high averages are linked to inflammation.",
    plantFoods: [
      "wholegrains, pulses and vegetables as the base of meals",
      "fibre, protein and healthy fats alongside carbohydrates",
    ],
    ifHigh: "This is a result to take to your GP, who will explain where it sits and what follows.",
  },
  FBC: {
    what: "Full Blood Count — a panel looking at red cells, white cells and platelets.",
    whyItMatters:
      "It can pick up anaemia and other things that sometimes show up first as a change in your hair.",
    ifLow: "Any flagged component should be interpreted by your GP.",
    ifHigh: "Any flagged component should be interpreted by your GP.",
  },
  ESR: {
    what: "Erythrocyte Sedimentation Rate — another general marker of inflammation.",
    whyItMatters: "Read alongside CRP for a fuller inflammation picture.",
    ifHigh: "Follow this up with your GP.",
  },
  ANA: {
    what: "Antinuclear Antibodies — a screening test for autoimmune activity.",
    whyItMatters:
      "Some scalp and hair conditions are investigated alongside autoimmune screening.",
    ifHigh: "A positive result needs a clinician to interpret it; it isn't an answer on its own.",
  },

  // Thyroid
  TSH: {
    what: "Thyroid Stimulating Hormone — the signal telling your thyroid how hard to work.",
    whyItMatters:
      "Thyroid balance sets the pace of the whole hair cycle, which is why the book treats it as a medical conversation rather than a haircare one.",
    ifLow: "Your GP will interpret this alongside your other thyroid markers.",
    ifHigh: "Your GP will interpret this alongside your other thyroid markers.",
  },
  "Free T3": {
    what: "The active form of thyroid hormone that your cells use.",
    whyItMatters: "Follicles are sensitive to thyroid hormone levels.",
    ifLow: "One for your GP to interpret with TSH and Free T4.",
    ifHigh: "One for your GP to interpret with TSH and Free T4.",
  },
  "Free T4": {
    what: "The main hormone your thyroid makes, which converts to T3 in the body.",
    whyItMatters: "Reads best alongside TSH and Free T3.",
    ifLow: "Discuss with your GP.",
    ifHigh: "Discuss with your GP.",
  },
  "Thyroid Antibodies (TPO)": {
    what: "Antibodies that point to autoimmune thyroid activity.",
    whyItMatters:
      "Thyroid activity influences the hair cycle, so antibodies are usually monitored over time.",
    ifHigh: "Your GP will advise on monitoring.",
  },

  // Hormones
  "Oestrogen / Oestradiol": {
    what: "Your main oestrogen — it shifts across your cycle and through life stages.",
    whyItMatters:
      "Hormonal shifts are one of the life-stage themes in the book, and density can change with them.",
  },
  Testosterone: {
    what: "An androgen present in everyone, in differing amounts.",
    whyItMatters: "Androgen levels and sensitivity influence hair density.",
    ifHigh: "Worth raising with your GP, particularly alongside cycle changes.",
  },
  "DHEA-S": {
    what: "An adrenal hormone that converts into other hormones.",
    whyItMatters: "Part of the hormonal picture your GP reads as a whole.",
  },
  Prolactin: {
    what: "A pituitary hormone best known for milk production.",
    whyItMatters: "It can affect cycles, which sits in the same hormonal picture as hair changes.",
    ifHigh: "Ask your GP to look into it.",
  },
  FSH: {
    what: "Follicle-Stimulating Hormone — part of how the ovaries and cycle are regulated.",
    whyItMatters: "Often used to understand where you are in a life-stage transition.",
  },
  LH: {
    what: "Luteinising Hormone — works with FSH around ovulation.",
    whyItMatters: "The LH:FSH relationship is used in investigations your GP may run.",
  },
  Cortisol: {
    what: "Your main stress hormone, made by the adrenal glands.",
    whyItMatters:
      "Sustained stress is a recognised trigger for shedding, which the book addresses directly.",
    ifHigh: "Protect sleep and recovery where you can, and raise a persistently high result with your GP.",
  },
  "Insulin / HbA1c": {
    what: "Insulin regulates blood sugar; HbA1c reflects the three-month average.",
    whyItMatters: "Both sit in the inflammation and metabolic picture your GP reads together.",
  },
};

export interface MarkerCategoryMeta {
  key: "iron" | "vitamins" | "minerals" | "inflammation" | "thyroid" | "hormones" | "other";
  label: string;
  blurb: string;
}

export const CATEGORY_META: Record<string, MarkerCategoryMeta> = {
  iron: {
    key: "iron",
    label: "Iron & storage",
    blurb: "How much iron is available and stored for growth-hungry follicles.",
  },
  vitamins: {
    key: "vitamins",
    label: "Vitamins",
    blurb: "Micronutrients that support the hair growth cycle and scalp health.",
  },
  minerals: {
    key: "minerals",
    label: "Minerals",
    blurb: "Trace elements that keep follicles, enzymes and thyroid function running.",
  },
  inflammation: {
    key: "inflammation",
    label: "Inflammation & general",
    blurb: "Signals of systemic inflammation and metabolic balance.",
  },
  thyroid: {
    key: "thyroid",
    label: "Thyroid",
    blurb: "Regulates the pace of the entire hair growth cycle.",
  },
  hormones: {
    key: "hormones",
    label: "Hormones",
    blurb: "Sex and stress hormones that shape density, shedding and pattern.",
  },
  other: {
    key: "other",
    label: "Other markers",
    blurb: "Additional values pulled from your report that STRAND doesn't reference yet.",
  },
};
