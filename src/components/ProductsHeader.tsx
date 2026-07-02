import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { UserProduct } from "@/hooks/useUserProducts";

// ─────────────────────────────────────────────────────────────────────────
// Shared header used across the five product tabs (Shelf / Faves / Wish /
// Off / Ingr.). Owns the tab strip + search + filter state so each page
// gets the exact same UX.
// ─────────────────────────────────────────────────────────────────────────

export type ProductsTab = "shelf" | "favourites" | "wishlist" | "off-shelf" | "intel";

const TABS: { id: ProductsTab; label: string; path: string }[] = [
  { id: "shelf",      label: "Shelf", path: "/products" },
  { id: "favourites", label: "Faves", path: "/products/favourites" },
  { id: "wishlist",   label: "Wish",  path: "/products/wishlist" },
  { id: "off-shelf",  label: "Off",   path: "/products/off-shelf" },
  { id: "intel",      label: "Ingr.", path: "/products/avoidlist" },
];

// Display order for shelf categories — mirrors the product flow described in
// "How To Love Your Afro" (pre-shampoo → cleanse → condition → leave-in →
// style → seal → refresh → treat). Anything that doesn't match falls into
// "Other" and renders last.
export const CATEGORY_ORDER: { key: string; label: string; matchers: RegExp[] }[] = [
  { key: "cleanser",    label: "Cleanser",         matchers: [/pre[\s-]?shampoo/i, /pre[\s-]?poo/i, /shampoo/i, /cleanser/i, /clarif/i, /co[\s-]?wash/i, /scalp\s?exfoliant/i, /scalp\s?scrub/i, /exfoliant/i] },
  { key: "conditioner", label: "Conditioner",      matchers: [/deep\s?condition/i, /hair\s?mask/i, /^conditioner/i, /rinse[\s-]?out/i] },
  { key: "leavein",     label: "Leave-In",         matchers: [/leave[\s-]?in/i, /detangler/i, /milk/i] },
  { key: "styler",      label: "Styler",           matchers: [/curl\s?cream/i, /twisting/i, /styling/i, /styler/i, /custard/i, /pudding/i, /gel/i, /mousse/i, /foam/i, /jelly/i, /butter/i] },
  { key: "oil",         label: "Oil & Sealant",    matchers: [/^oil/i, /serum/i, /sealant/i] },
  { key: "refresh",     label: "Refresh & Finish", matchers: [/refresh/i, /spray/i, /mist/i, /hairspray/i, /shine/i] },
  { key: "treatments",  label: "Treatment",        matchers: [/bond/i, /keratin/i, /protein/i, /treatment/i] },
  { key: "scalp",       label: "Scalp",            matchers: [/scalp/i, /tonic/i] },
];

export const categoryBucket = (raw: string | null | undefined) => {
  const c = (raw ?? "").trim();
  if (!c) return { key: "other", label: "Other" };
  for (const b of CATEGORY_ORDER) {
    if (b.matchers.some((rx) => rx.test(c))) return { key: b.key, label: b.label };
  }
  return { key: "other", label: "Treatments" };
};

export interface ProductsFilterState {
  search: string;
  categoryFilter: string | null;
  brandFilter: string | null;
  ratingFilter: number | null;
}

export const useProductsFilterState = () => {
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const clear = () => {
    setCategoryFilter(null);
    setBrandFilter(null);
    setRatingFilter(null);
  };

  return {
    search, setSearch,
    filtersOpen, setFiltersOpen,
    categoryFilter, setCategoryFilter,
    brandFilter, setBrandFilter,
    ratingFilter, setRatingFilter,
    clear,
  };
};

/** Apply the shared search + filter rules to a product list. */
export const applyProductFilters = (
  products: UserProduct[],
  state: Pick<ProductsFilterState, "search" | "categoryFilter" | "brandFilter" | "ratingFilter">,
) => {
  const q = state.search.trim().toLowerCase();
  return products.filter((p) => {
    if (state.categoryFilter && categoryBucket(p.category).key !== state.categoryFilter) return false;
    if (state.brandFilter && (p.brand ?? "") !== state.brandFilter) return false;
    if (state.ratingFilter && (p.rating ?? 0) < state.ratingFilter) return false;
    if (q) {
      const hay = [
        p.name,
        p.brand ?? "",
        p.category ?? "",
        ...(p.ingredients ?? []),
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

interface ProductsHeaderProps {
  active: ProductsTab;
  /** Source list used to derive available brand/category chips. */
  products?: UserProduct[];
  /** Filtered list count, for the "X of Y" indicator. */
  filteredCount?: number;
  state: ReturnType<typeof useProductsFilterState>;
  /** When true (Ingr. tab), only the search box is shown — no category/brand/rating chips. */
  searchOnly?: boolean;
  /** Override placeholder copy for the search box. */
  searchPlaceholder?: string;
}

const ProductsHeader = ({
  active,
  products = [],
  filteredCount,
  state,
  searchOnly = false,
  searchPlaceholder = "Search name, brand or ingredient…",
}: ProductsHeaderProps) => {
  const navigate = useNavigate();

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.brand) set.add(p.brand);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of products) {
      const { key, label } = categoryBucket(p.category);
      set.set(key, label);
    }
    const ordered: { key: string; label: string }[] = [];
    for (const b of CATEGORY_ORDER) if (set.has(b.key)) ordered.push({ key: b.key, label: set.get(b.key)! });
    if (set.has("other")) ordered.push({ key: "other", label: "Other" });
    return ordered;
  }, [products]);

  const activeFilterCount =
    (state.categoryFilter ? 1 : 0) +
    (state.brandFilter ? 1 : 0) +
    (state.ratingFilter ? 1 : 0);

  return (
    <>
      {/* Tab strip */}
      <div className="px-5 pb-4">
        <div className="grid grid-cols-5 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => { if (!isActive) navigate(t.path); }}
                className={cn(
                  "py-2 text-[10px] rounded-md font-medium transition-colors min-h-[40px] truncate px-0.5",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + filters */}
      <div className="px-5 pb-3 space-y-2">
        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={state.search}
            onChange={(e) => state.setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 pl-9 pr-9 text-sm"
          />
          {state.search && (
            <button
              onClick={() => state.setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {!searchOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => state.setFiltersOpen(!state.filtersOpen)}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] font-medium transition-colors",
                state.filtersOpen || activeFilterCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center size-4 rounded-full bg-background/20 text-[9px]">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={state.clear}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
            {typeof filteredCount === "number" && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                {filteredCount} of {products.length}
              </span>
            )}
          </div>
        )}

        {!searchOnly && state.filtersOpen && (
          <div className="rounded-[12px] border border-border bg-card p-3 space-y-3">
            {categoryOptions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptions.map((c) => {
                    const isActive = state.categoryFilter === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => state.setCategoryFilter(isActive ? null : c.key)}
                        className={cn(
                          "h-7 px-2.5 rounded-full border text-[11px] transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border text-muted-foreground",
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {brandOptions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Brand</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {brandOptions.map((b) => {
                    const isActive = state.brandFilter === b;
                    return (
                      <button
                        key={b}
                        onClick={() => state.setBrandFilter(isActive ? null : b)}
                        className={cn(
                          "h-7 px-2.5 rounded-full border text-[11px] transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border text-muted-foreground",
                        )}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Min rating</p>
              <div className="flex flex-wrap gap-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const isActive = state.ratingFilter === n;
                  return (
                    <button
                      key={n}
                      onClick={() => state.setRatingFilter(isActive ? null : n)}
                      className={cn(
                        "h-7 px-2.5 rounded-full border text-[11px] transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground",
                      )}
                    >
                      {n}★+
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ProductsHeader;
