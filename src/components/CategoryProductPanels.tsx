// Collapsible category panels for a member's product list.
//
// Shared by the "Add products used" picker sheet, the styling section of the
// wash day logger, and the member's own shelf so all three behave identically.
// Panels are non-exclusive (several may be open at once) and every product
// lands in exactly one panel — null/unknown categories fall under "Other" — so
// the expanded row count always equals the incoming list length.
//
// Default state differs by caller, deliberately:
//   - picker sheet / styling: CLOSED (`defaultOpen="none"`) — she is hunting
//     for one product among many.
//   - her shelf: OPEN (`defaultOpen="all"`) — she opened Products to see her
//     products, so collapsing is opt-in.
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

/** One category panel. Callers with their own grouping pass these directly. */
export interface CategoryPanelSection {
  slug: string;
  label: string;
  products: UserProduct[];
}

interface Props {
  products: UserProduct[];
  /**
   * Pre-grouped sections, for callers that own their grouping (the shelf uses
   * the Products tab's category buckets). When omitted, the shared
   * `groupProductsByCategory` grouping is used.
   */
  sections?: CategoryPanelSection[];
  /** Hoists the categories a wash-day step usually needs; nothing is filtered. */
  stepHint?: StepProductHint | null;
  selectedIds?: string[];
  /** Short lists read better flat — below this many products, no panels. */
  flatBelow?: number;
  /** Panel state on mount. "none" (default) = all closed, "all" = all open. */
  defaultOpen?: "none" | "all";
  /**
   * Category to open on mount. Used by the picker sheet so a member coming back
   * for a second product on the same step lands on the panel she just used
   * instead of re-hunting for it. Session-only — the caller holds it.
   */
  initialOpenCategory?: ProductCategorySlug | null;
  /**
   * Persisted collapsed categories (controlled). Only meaningful with
   * `defaultOpen="all"`: the shelf remembers what she folded away between
   * visits. When provided, the caller owns the state.
   */
  collapsedSlugs?: string[];
  onToggleCollapsed?: (slug: string) => void;
  /**
   * Force every panel open regardless of state — used while a search or filter
   * is active, so a match can never hide inside a collapsed group.
   */
  forceOpen?: boolean;
  /** Count rendering: "dot" → "Serum · 3", "parens" → "Serum (3)". */
  countStyle?: "dot" | "parens";
  /** Optional DOM id per panel, for scroll-position restoration. */
  sectionId?: (slug: string) => string | undefined;
  renderRow: (p: UserProduct) => ReactNode;
  className?: string;
}

const CategoryProductPanels = ({
  products,
  sections: sectionsProp,
  stepHint,
  selectedIds = [],
  flatBelow = 6,
  defaultOpen = "none",
  initialOpenCategory = null,
  collapsedSlugs,
  onToggleCollapsed,
  forceOpen = false,
  countStyle = "dot",
  sectionId,
  renderRow,
  className,
}: Props) => {
  const sections = useMemo<CategoryPanelSection[]>(
    () =>
      sectionsProp ??
      groupProductsByCategory(products, stepHint).map((s) => ({
        slug: s.slug as string,
        label: s.label,
        products: s.products,
      })),
    [sectionsProp, products, stepHint],
  );

  // Closed-by-default callers track what's OPEN; the shelf (open-by-default)
  // hands us what's COLLAPSED instead, so this local state is unused there.
  const [open, setOpen] = useState<string[]>(
    initialOpenCategory ? [initialOpenCategory] : [],
  );

  // Re-seed when the caller hands over a different remembered category (the
  // sheet is reopened for another step). Never collapses what she opened by
  // hand within a single viewing — only reacts to the prop changing.
  useEffect(() => {
    if (initialOpenCategory) setOpen([initialOpenCategory]);
  }, [initialOpenCategory]);

  const controlled = Array.isArray(collapsedSlugs);
  const isPanelOpen = (slug: string) => {
    if (forceOpen) return true;
    if (controlled) return !collapsedSlugs!.includes(slug);
    if (defaultOpen === "all") return !open.includes(slug); // local collapse set
    return open.includes(slug);
  };
  const toggle = (slug: string) => {
    if (controlled) {
      onToggleCollapsed?.(slug);
      return;
    }
    setOpen((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
    );
  };

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
        const isOpen = isPanelOpen(s.slug);
        const selectedCount = s.products.filter((p) => selectedIds.includes(p.id)).length;
        return (
          <div
            key={s.slug}
            id={sectionId?.(s.slug)}
            data-scroll-section={sectionId?.(s.slug) ? "" : undefined}
            className="rounded-[12px] border border-border bg-card overflow-hidden"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(s.slug)}
              className="w-full min-h-[48px] px-3 py-2.5 flex items-center gap-2 text-left"
            >
              <span className="text-[13px] font-medium text-foreground">
                {s.label}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {countStyle === "parens" ? `(${s.products.length})` : `· ${s.products.length}`}
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
