// Curated supplement catalogue for the search-and-add picker. Deliberately
// short and everyday — anything not here is added as free text, exactly like
// the medications picker.

export interface SupplementOption {
  name: string;
  category: string;
}

export const MAX_SUPPLEMENTS = 20;

export const SUPPLEMENT_CATALOG: SupplementOption[] = [
  { name: "Vitamin D3", category: "Vitamin" },
  { name: "Vitamin C", category: "Vitamin" },
  { name: "Vitamin B12", category: "Vitamin" },
  { name: "Vitamin B Complex", category: "Vitamin" },
  { name: "Folate (B9)", category: "Vitamin" },
  { name: "Vitamin A", category: "Vitamin" },
  { name: "Vitamin E", category: "Vitamin" },
  { name: "Vitamin K2", category: "Vitamin" },
  { name: "Multivitamin", category: "Multi" },
  { name: "Prenatal multivitamin", category: "Multi" },
  { name: "Iron (ferrous fumarate)", category: "Mineral" },
  { name: "Iron (ferrous sulfate)", category: "Mineral" },
  { name: "Gentle iron (bisglycinate)", category: "Mineral" },
  { name: "Zinc", category: "Mineral" },
  { name: "Magnesium Glycinate", category: "Mineral" },
  { name: "Magnesium Citrate", category: "Mineral" },
  { name: "Calcium", category: "Mineral" },
  { name: "Selenium", category: "Mineral" },
  { name: "Iodine", category: "Mineral" },
  { name: "Copper", category: "Mineral" },
  { name: "Omega-3 Fish Oil", category: "Fatty acid" },
  { name: "Algal Omega-3 (vegan)", category: "Fatty acid" },
  { name: "Cod Liver Oil", category: "Fatty acid" },
  { name: "Flaxseed Oil", category: "Fatty acid" },
  { name: "Evening Primrose Oil", category: "Fatty acid" },
  { name: "Biotin", category: "Hair & nails" },
  { name: "Collagen", category: "Hair & nails" },
  { name: "Silica", category: "Hair & nails" },
  { name: "MSM", category: "Hair & nails" },
  { name: "Hair, skin & nails complex", category: "Hair & nails" },
  { name: "Probiotic", category: "Gut" },
  { name: "Digestive enzymes", category: "Gut" },
  { name: "Psyllium husk", category: "Gut" },
  { name: "Protein powder", category: "Protein" },
  { name: "Collagen peptides", category: "Protein" },
  { name: "Ashwagandha", category: "Herbal" },
  { name: "Turmeric / Curcumin", category: "Herbal" },
  { name: "Saw Palmetto", category: "Herbal" },
  { name: "Moringa", category: "Herbal" },
  { name: "Sea Moss", category: "Herbal" },
  { name: "Spirulina", category: "Herbal" },
  { name: "Rosemary extract", category: "Herbal" },
  { name: "Nettle root", category: "Herbal" },
  { name: "Maca", category: "Herbal" },
  { name: "Coenzyme Q10", category: "Other" },
  { name: "Creatine", category: "Other" },
  { name: "Melatonin", category: "Other" },
];

export function searchSupplements(query: string, exclude: string[] = []): SupplementOption[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(exclude.map((n) => n.toLowerCase()));
  const pool = SUPPLEMENT_CATALOG.filter((s) => !taken.has(s.name.toLowerCase()));
  if (!q) return pool.slice(0, 12);
  return pool
    .filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    .slice(0, 20);
}
