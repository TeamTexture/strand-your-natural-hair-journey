// Curated UK medication list grouped by class. Used by ProfileStep2 medication
// picker. Each entry has a category for analytics/filtering and a display name
// shown both in the dropdown and as a chip after selection.

export interface MedOption {
  name: string;
  category: string;
}

export const MEDICATION_CATALOG: MedOption[] = [
  // Beta blockers
  { name: "Propranolol", category: "Beta blockers" },
  { name: "Atenolol", category: "Beta blockers" },
  { name: "Bisoprolol", category: "Beta blockers" },
  { name: "Metoprolol", category: "Beta blockers" },
  // Blood thinners
  { name: "Warfarin", category: "Blood thinners" },
  { name: "Heparin", category: "Blood thinners" },
  { name: "Rivaroxaban", category: "Blood thinners" },
  { name: "Apixaban", category: "Blood thinners" },
  // ACE inhibitors
  { name: "Lisinopril", category: "ACE inhibitors" },
  { name: "Ramipril", category: "ACE inhibitors" },
  { name: "Perindopril", category: "ACE inhibitors" },
  // SSRIs
  { name: "Sertraline", category: "Antidepressants (SSRI)" },
  { name: "Fluoxetine", category: "Antidepressants (SSRI)" },
  { name: "Citalopram", category: "Antidepressants (SSRI)" },
  { name: "Escitalopram", category: "Antidepressants (SSRI)" },
  { name: "Paroxetine", category: "Antidepressants (SSRI)" },
  // SNRIs
  { name: "Venlafaxine", category: "Antidepressants (SNRI)" },
  { name: "Duloxetine", category: "Antidepressants (SNRI)" },
  // Mood stabilisers
  { name: "Lithium", category: "Mood stabilisers" },
  { name: "Sodium Valproate", category: "Mood stabilisers" },
  { name: "Lamotrigine", category: "Mood stabilisers" },
  // Anticonvulsants
  { name: "Valproate", category: "Anticonvulsants" },
  { name: "Carbamazepine", category: "Anticonvulsants" },
  { name: "Phenytoin", category: "Anticonvulsants" },
  // Retinoids
  { name: "Isotretinoin", category: "Retinoids" },
  { name: "Tretinoin", category: "Retinoids" },
  // Steroids
  { name: "Prednisolone", category: "Steroids" },
  { name: "Hydrocortisone", category: "Steroids" },
  { name: "Dexamethasone", category: "Steroids" },
  // Immunosuppressants
  { name: "Methotrexate", category: "Immunosuppressants" },
  { name: "Azathioprine", category: "Immunosuppressants" },
  { name: "Ciclosporin", category: "Immunosuppressants" },
  // Hormonal contraceptives
  { name: "Combined pill", category: "Hormonal contraceptives" },
  { name: "Progesterone-only pill", category: "Hormonal contraceptives" },
  { name: "Hormonal IUD", category: "Hormonal contraceptives" },
  { name: "Implant", category: "Hormonal contraceptives" },
  { name: "Injection", category: "Hormonal contraceptives" },
  // Antifungals
  { name: "Fluconazole", category: "Antifungals" },
  { name: "Itraconazole", category: "Antifungals" },
  { name: "Terbinafine", category: "Antifungals" },
  // Thyroid
  { name: "Levothyroxine", category: "Thyroid medication" },
  { name: "Carbimazole", category: "Thyroid medication" },
  // HRT
  { name: "Combined HRT", category: "HRT" },
  { name: "Oestrogen-only HRT", category: "HRT" },
  { name: "Testosterone HRT", category: "HRT" },
];

export const MAX_MEDICATIONS = 20;

/** Fuzzy-ish search: case-insensitive substring match on name OR category. */
export const searchMedications = (query: string, exclude: string[] = []): MedOption[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excludeSet = new Set(exclude.map((e) => e.toLowerCase()));
  return MEDICATION_CATALOG.filter(
    (m) =>
      !excludeSet.has(m.name.toLowerCase()) &&
      (m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)),
  ).slice(0, 8);
};
