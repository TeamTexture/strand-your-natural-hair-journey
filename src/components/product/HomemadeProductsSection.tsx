// Split a product list into store-bought and homemade, and render the
// homemade items in their own distinct section — the same one the Products
// page uses. Homemade products (is_homemade = true) are a different kind of
// thing (concentration-aware analysis from a recipe, no label), so they are
// never mixed into the same list as store-bought products.
//
// Used by Home "My shelf", Favourites, Wishlist, Off Shelf and All Products
// so every place shelf items appear together keeps the two groups apart,
// consistent with the category grouping on the Products page.

import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import type { UserProduct } from "@/hooks/useUserProducts";
import SectionLabel from "@/components/SectionLabel";

export interface HomemadeSplit {
  storeBought: UserProduct[];
  homemade: UserProduct[];
}

/** Split a product list into store-bought and homemade. */
export function splitByHomemade(products: UserProduct[]): HomemadeSplit {
  const storeBought: UserProduct[] = [];
  const homemade: UserProduct[] = [];
  for (const p of products) {
    if ((p as UserProduct & { is_homemade?: boolean }).is_homemade) homemade.push(p);
    else storeBought.push(p);
  }
  return { storeBought, homemade };
}

interface SectionProps {
  products: UserProduct[];
  /** Render one homemade product row. */
  renderRow: (p: UserProduct) => ReactNode;
  /** When set, overrides the default count label, e.g. for shorter previews. */
  label?: string;
  className?: string;
  /** Show the explainer line under the header (default true). */
  showExplainer?: boolean;
}

/**
 * The shared "Homemade" section block. Matches the Products page treatment:
 * tinted rounded panel, FlaskConical icon, "My homemade mixes" label and a
 * one-line explainer. Same card treatment inside, so it is not second-class.
 */
export function HomemadeProductsSection({
  products,
  renderRow,
  label,
  className,
  showExplainer = true,
}: SectionProps) {
  if (products.length === 0) return null;
  return (
    <section
      className={`rounded-[18px] border border-primary/30 bg-primary/[0.05] p-3 space-y-2.5 mt-1 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 px-0.5">
        <FlaskConical className="size-4 text-primary shrink-0" />
        <SectionLabel className="!mt-0 !mb-0 !px-0">
          {label ?? `My homemade mixes (${products.length})`}
        </SectionLabel>
      </div>
      {showExplainer && (
        <p className="text-[11px] text-muted-foreground leading-snug px-0.5">
          Made by you — no label to read, so the analysis works from your
          recipe and how much of each thing went in.
        </p>
      )}
      <div className="space-y-3">
        {products.map(renderRow)}
      </div>
    </section>
  );
}

export default HomemadeProductsSection;
