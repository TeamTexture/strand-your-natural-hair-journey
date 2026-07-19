// Plain-English explanations for each blood marker STRAND tracks.
// Kept intentionally short and non-diagnostic — surfaces on the Blood Panel
// Review page as expandable dropdowns.

export interface MarkerExplanation {
  what: string; // one-sentence "what this measures"
  whyItMatters: string; // one-sentence hair/health relevance
  ifLow?: string;
  ifHigh?: string;
}

export const MARKER_EXPLANATIONS: Record<string, MarkerExplanation> = {
  // Iron & storage
  Ferritin: {
    what: "Ferritin is your body's iron storage tank — the amount of iron you have in reserve.",
    whyItMatters: "Hair follicles need iron to grow. Low stores are a leading cause of increased shedding in women.",
    ifLow: "Low stores can mean more shedding, weaker regrowth and fatigue. Explore iron-rich foods and speak to your GP.",
    ifHigh: "Iron overload can be linked to inflammation or genetic conditions. Ask a clinician to investigate.",
  },
  "Serum Iron": {
    what: "The amount of iron currently circulating in your blood, right now.",
    whyItMatters: "A snapshot of iron availability — reads best alongside ferritin and transferrin saturation.",
    ifLow: "Not enough iron in circulation. Combine with ferritin and diet before concluding.",
    ifHigh: "Iron in blood is high; check for supplementation timing or overload.",
  },
  TIBC: {
    what: "Total Iron Binding Capacity — how much iron your blood is able to carry.",
    whyItMatters: "Rises when the body is trying to grab more iron; useful for spotting hidden deficiency.",
    ifLow: "Often seen with inflammation or protein issues.",
    ifHigh: "Body is hungry for iron — often signals depleted stores.",
  },
  "Transferrin Saturation": {
    what: "The percentage of your iron-carrying protein that is actually loaded with iron.",
    whyItMatters: "Confirms whether iron is available for use — a strong indicator alongside ferritin.",
    ifLow: "Iron isn't reaching where it needs to. Common in early deficiency.",
    ifHigh: "Iron is over-saturated. Investigate with your clinician.",
  },

  // Vitamins
  "Vitamin D": {
    what: "A hormone-like vitamin made in the skin from sunlight and absorbed from food.",
    whyItMatters: "Vitamin D is involved in the hair growth cycle and immune balance. Deficiency is common in the UK, especially in melanin-rich skin.",
    ifLow: "Increase sun exposure sensibly, consider a supplement, and eat oily fish, eggs and fortified foods.",
    ifHigh: "Rare unless supplementing heavily — pause supplements and retest.",
  },
  "Vitamin B12": {
    what: "A vitamin your body needs to make red blood cells and healthy nerves.",
    whyItMatters: "Low B12 can drive shedding, tiredness and brittle strands. Vegans and older adults are more at risk.",
    ifLow: "Include eggs, dairy, fish, meat or a B12 supplement. Persistent lows may need injections.",
    ifHigh: "Usually harmless if supplementing; investigate if not.",
  },
  Folate: {
    what: "The natural form of folic acid — helps your cells divide and grow.",
    whyItMatters: "Hair cells are among the fastest-growing in the body; folate supports that turnover.",
    ifLow: "Add leafy greens, beans, lentils and citrus. Discuss supplements with your GP.",
    ifHigh: "Generally not a concern; usually reflects supplementation.",
  },
  "Vitamin A": {
    what: "A fat-soluble vitamin critical for skin, scalp and cell renewal.",
    whyItMatters: "Both deficiency and excess can affect the scalp and hair.",
    ifLow: "Include eggs, dairy, orange vegetables and dark leafy greens.",
    ifHigh: "Often from over-supplementing. Excess can trigger shedding — pause and retest.",
  },
  "Vitamin E": {
    what: "An antioxidant vitamin that protects your cells from oxidative stress.",
    whyItMatters: "Supports scalp health and defends the follicle from damage.",
    ifLow: "Add nuts, seeds, avocado and vegetable oils.",
    ifHigh: "Rare — usually only with supplementation.",
  },
  Biotin: {
    what: "A B-vitamin your body uses to build keratin, the protein hair is made of.",
    whyItMatters: "True biotin deficiency is rare but can cause thinning. Most people get enough from food.",
    ifLow: "Eat eggs, nuts, seeds, salmon and sweet potato.",
    ifHigh: "Biotin supplements can distort thyroid and hormone tests — pause before retesting.",
  },

  // Minerals
  Zinc: {
    what: "An essential mineral for immune function, wound healing and hair follicle repair.",
    whyItMatters: "Low zinc is closely linked to shedding, slow growth and scalp issues.",
    ifLow: "Add pumpkin seeds, oysters, red meat, chickpeas and cashews.",
    ifHigh: "Usually from supplements — high zinc blocks copper absorption.",
  },
  Magnesium: {
    what: "A mineral involved in over 300 processes, including stress regulation and sleep.",
    whyItMatters: "Chronic stress depletes magnesium, and stress is a known trigger for shedding.",
    ifLow: "Include leafy greens, nuts, seeds, beans and dark chocolate.",
    ifHigh: "Rare unless supplementing.",
  },
  Selenium: {
    what: "A trace mineral needed for thyroid function and antioxidant defence.",
    whyItMatters: "Selenium levels influence thyroid health, which directly affects the hair cycle.",
    ifLow: "Brazil nuts (1–2 a day is plenty), fish, eggs.",
    ifHigh: "High selenium is itself a known cause of hair loss — pause supplements immediately.",
  },
  Copper: {
    what: "A trace mineral your body uses to make pigment, connective tissue and enzymes.",
    whyItMatters: "Copper contributes to natural hair colour and follicle health.",
    ifLow: "Include shellfish, nuts, seeds, dark chocolate and organ meats.",
    ifHigh: "Investigate with a clinician; can indicate inflammation.",
  },

  // Inflammation & general
  CRP: {
    what: "A marker of inflammation in the body — rises when something is inflamed.",
    whyItMatters: "Chronic inflammation is linked to scalp conditions and disrupted growth cycles.",
    ifHigh: "Investigate diet, gut health, infections or stress. Not diagnostic on its own.",
  },
  "Blood Glucose": {
    what: "The amount of sugar in your bloodstream when the sample was taken.",
    whyItMatters: "Persistently high glucose drives inflammation, which can affect the scalp and follicles.",
    ifLow: "Usually only concerning if symptomatic. Eat regularly and check with a clinician.",
    ifHigh: "Reduce refined sugars, improve balance of protein, fibre and fats; retest.",
  },
  Albumin: {
    what: "The main protein in your blood — reflects general protein status and liver health.",
    whyItMatters: "Adequate protein is essential for building hair keratin.",
    ifLow: "May reflect low protein intake, gut absorption issues or chronic illness.",
    ifHigh: "Often just reflects dehydration.",
  },
  HbA1c: {
    what: "Your average blood sugar over the last ~3 months.",
    whyItMatters: "A better long-term indicator than a single glucose reading; high levels drive inflammation.",
    ifHigh: "Above 42 mmol/mol is pre-diabetic; above 48 is diabetic range. Speak to your GP.",
  },
  FBC: {
    what: "Full Blood Count — a panel checking red cells, white cells and platelets.",
    whyItMatters: "Detects anaemia, infection and other issues that can present as hair changes.",
  },
  ESR: {
    what: "Erythrocyte Sedimentation Rate — another marker of general inflammation.",
    whyItMatters: "High ESR alongside high CRP strengthens the case for an inflammatory process.",
    ifHigh: "Follow up with your clinician.",
  },
  ANA: {
    what: "Antinuclear Antibodies — screens for autoimmune activity.",
    whyItMatters: "Some scarring alopecias and autoimmune conditions show a positive ANA.",
    ifHigh: "A positive result needs interpretation by a clinician — it isn't diagnostic alone.",
  },

  // Thyroid
  TSH: {
    what: "Thyroid Stimulating Hormone — tells the thyroid gland how hard to work.",
    whyItMatters: "Thyroid imbalance is a major cause of diffuse shedding in women.",
    ifLow: "Can suggest an overactive thyroid — speak to your GP.",
    ifHigh: "Can suggest an underactive thyroid — speak to your GP.",
  },
  "Free T3": {
    what: "The active form of thyroid hormone that your cells actually use.",
    whyItMatters: "Follicles are sensitive to T3 — low levels slow growth.",
    ifLow: "Investigate thyroid function fully with a clinician.",
    ifHigh: "Investigate with a clinician — may indicate over-treatment or overactive thyroid.",
  },
  "Free T4": {
    what: "The main hormone your thyroid makes; converts to T3 in the body.",
    whyItMatters: "Reads best alongside TSH and Free T3 for the full thyroid picture.",
    ifLow: "Discuss under-active thyroid with your GP.",
    ifHigh: "Discuss over-active thyroid with your GP.",
  },
  "Thyroid Antibodies (TPO)": {
    what: "Antibodies that indicate autoimmune thyroid activity (Hashimoto's / Graves').",
    whyItMatters: "Even with 'normal' TSH, high antibodies can drive shedding and warrant monitoring.",
    ifHigh: "Discuss ongoing thyroid monitoring with a clinician.",
  },

  // Hormones
  "Oestrogen / Oestradiol": {
    what: "Your main oestrogen — fluctuates through your cycle and drops in menopause.",
    whyItMatters: "Falling oestrogen changes the ratio to androgens, which can drive thinning at the crown.",
  },
  Testosterone: {
    what: "An androgen made in both women and men in different amounts.",
    whyItMatters: "Elevated levels or high sensitivity can trigger hair thinning.",
    ifHigh: "Discuss with a clinician, especially alongside cycle changes or acne.",
  },
  "DHEA-S": {
    what: "An adrenal hormone that converts into other hormones, including androgens.",
    whyItMatters: "Chronic stress can shift DHEA-S levels and influence the hair cycle.",
  },
  Prolactin: {
    what: "A pituitary hormone best known for breast milk production.",
    whyItMatters: "High prolactin can disrupt periods and shift androgen balance, impacting hair.",
    ifHigh: "Ask a clinician to investigate.",
  },
  FSH: {
    what: "Follicle-Stimulating Hormone — regulates the ovaries and cycle.",
    whyItMatters: "Rising FSH is a marker of approaching or reaching menopause.",
  },
  LH: {
    what: "Luteinising Hormone — works with FSH to regulate ovulation.",
    whyItMatters: "LH:FSH ratio is used in investigations like PCOS, which affects hair.",
  },
  Cortisol: {
    what: "Your main stress hormone, made by the adrenal glands.",
    whyItMatters: "Chronically raised cortisol pushes more hairs into the shedding phase.",
    ifHigh: "Prioritise sleep, boundaries and stress recovery; investigate if persistent.",
  },
  "Insulin / HbA1c": {
    what: "Insulin regulates blood sugar; HbA1c reflects the 3-month average.",
    whyItMatters: "Insulin resistance is linked to PCOS-type hair thinning and inflammation.",
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
