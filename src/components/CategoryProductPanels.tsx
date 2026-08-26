// Collapsible category panels for a member's product list.
//
// Shared by the "Add products used" picker sheet and the styling section of the
// wash day logger so the two behave identically. Panels are CLOSED on mount,
// non-exclusive (several may be open at once), and every product lands in
// exactly one panel — null/unknown categories fall under "Other" — so the
// expanded row count always equals the incoming list length.
//
// Selected products stay apparent while collapsed via a "n selected" badge on
// the panel header (chosen over hoisting a duplicate selected list, which would
// render the same row twice and make the add/remove controls ambiguous).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProduct } from "@/hooks/useUserProducts";
import {
  groupProductsByCategory,
  type ProductCategorySlug,
  type StepProductHint,
} from "@/lib/productCategories";

interface Props {
  products: UserProduct[];
  /** Hoists the categories a wash-day step usually needs; nothing is filtered. */
  stepHint?: StepProductHint | null;
  selectedIds?: string[];
  /** Short lists read better flat — below this many products, no panels. */
  flatBelow?: number;
  /**
   * Category to open on mount. Used by the picker sheet so a member coming back
   * for a second product on the same step lands on the panel she just used
   * instead of re-hunting for it. Session-only — the caller holds it.
   */
  initialOpenCategory?: ProductCategorySlug | null;
  renderRow: (p: UserProduct) => ReactNode;
  className?: string;
}

const CategoryProductPanels = ({
  products,
  stepHint,
  selectedIds = [],
  flatBelow = 6,
  initialOpenCategory = null,
  renderRow,
  className,
}: Props) => {
  const sections = useMemo(
    () => groupProductsByCategory(products, stepHint),
    [products, stepHint],
  );
  const [open, setOpen] = useState<ProductCategorySlug[]>(
    initialOpenCategory ? [initialOpenCategory] : [],
  );

  // Re-seed when the caller hands over a different remembered category (the
  // sheet is reopened for another step). Never collapses what she opened by
  // hand within a single viewing — only reacts to the prop changing.
  useEffect(() => {
    if (initialOpenCategory) setOpen([initialOpenCategory]);
  }, [initialOpenCategory]);


  if (products.length < flatBelow) {
    return (
      <div className={cn("space-y-2", className)}>
        {products.map((p) => (
          <div key={p.id}>{renderRow(p)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {sections.map((s) => {
        const isOpen = open.includes(s.slug);
        const selectedCount = s.products.filter((p) => selectedIds.includes(p.id)).length;
        return (
          <div
            key={s.slug}
            className="rounded-[12px] border border-border bg-card overflow-hidden"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((prev) =>
                  prev.includes(s.slug)
                    ? prev.filter((x) => x !== s.slug)
                    : [...prev, s.slug],
                )
              }
              className="w-full min-h-[48px] px-3 py-2.5 flex items-center gap-2 text-left"
            >
              <span className="text-[13px] font-medium text-foreground">
                {s.label}
              </span>
              <span className="text-[12px] text-muted-foreground">
                · {s.products.length}
              </span>
              {selectedCount > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                  {selectedCount} selected
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-4 text-primary ml-auto shrink-0 transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <div className="px-2 pb-2 space-y-2 border-t border-border/60 pt-2">
                {s.products.map((p) => (
                  <div key={p.id}>{renderRow(p)}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CategoryProductPanels;
