export const BRAND_CATEGORIES = [
  "Hair Care",
  "Supplements",
  "Hair Tools",
  "Hair Accessories",
  "Food & Nutrition",
  "Beauty & Skincare",
  "Wellness & Lifestyle",
  "Salon & Trade Supplies",
  "Education & Training",
  "Other",
] as const;

export type BrandCategory = (typeof BRAND_CATEGORIES)[number];
