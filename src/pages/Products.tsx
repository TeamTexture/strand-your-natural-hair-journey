import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, Link as LinkIcon, Loader2, ArrowDownToLine, Trash2, Search, SlidersHorizontal, X, Heart } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import FilePickerButton from "@/components/FilePickerButton";
import MyToolsSection from "@/components/MyToolsSection";
import OffShelfReasonSheet from "@/components/OffShelfReasonSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";
import { toast } from "sonner";

const tabs = [
  { id: "shelf",      label: "Shelf" },
  { id: "favourites", label: "Faves" },
  { id: "wishlist",   label: "Wish" },
  { id: "off-shelf",  label: "Off" },
  { id: "intel",      label: "Ingr." },
];

// Display order for shelf categories — mirrors the product flow described in
// "How To Love Your Afro" (pre-shampoo → cleanse → condition → leave-in →
// style → seal → refresh → treat). Anything that doesn't match falls into
// "Other" and renders last.
const CATEGORY_ORDER: { key: string; label: string; matchers: RegExp[] }[] = [
  { key: "pre",        label: "Pre-Shampoo",       matchers: [/pre[\s-]?shampoo/i, /pre[\s-]?poo/i] },
  { key: "cleanser",   label: "Cleanser",          matchers: [/shampoo/i, /cleanser/i, /clarif/i, /co[\s-]?wash/i] },
  { key: "conditioner",label: "Conditioner",       matchers: [/deep\s?condition/i, /hair\s?mask/i, /^conditioner/i, /rinse[\s-]?out/i] },
  { key: "leavein",    label: "Leave-In",          matchers: [/leave[\s-]?in/i, /detangler/i, /milk/i] },
  { key: "styler",     label: "Styler",            matchers: [/curl\s?cream/i, /twisting/i, /styling/i, /styler/i, /custard/i, /pudding/i, /gel/i, /mousse/i, /foam/i, /jelly/i, /butter/i] },
  { key: "oil",        label: "Oil & Sealant",     matchers: [/^oil/i, /serum/i, /sealant/i] },
  { key: "refresh",    label: "Refresh & Finish",  matchers: [/refresh/i, /spray/i, /mist/i, /hairspray/i, /shine/i] },
  { key: "treatments", label: "Pre-Shampoo",        matchers: [/treatment/i, /bond/i, /keratin/i, /protein/i] },
  { key: "scalp",      label: "Scalp",             matchers: [/scalp/i, /tonic/i] },
];

const categoryBucket = (raw: string | null | undefined) => {
  const c = (raw ?? "").trim();
  if (!c) return { key: "other", label: "Other" };
  for (const b of CATEGORY_ORDER) {
    if (b.matchers.some((rx) => rx.test(c))) return { key: b.key, label: b.label };
  }
  return { key: "other", label: "Other" };
};

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const Products = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [offShelfTarget, setOffShelfTarget] = useState<{ id: string; key: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { products, loading, remove, reload, setFavourite } = useUserProducts("shelf");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();

  // Search + filter state
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null); // minimum stars

  // Distinct brands + categories for filter chips
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

  // Apply search + filters before grouping
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && categoryBucket(p.category).key !== categoryFilter) return false;
      if (brandFilter && (p.brand ?? "") !== brandFilter) return false;
      if (ratingFilter && (p.rating ?? 0) < ratingFilter) return false;
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
  }, [products, search, categoryFilter, brandFilter, ratingFilter]);

  const activeFilterCount =
    (categoryFilter ? 1 : 0) + (brandFilter ? 1 : 0) + (ratingFilter ? 1 : 0);

  const clearFilters = () => {
    setCategoryFilter(null);
    setBrandFilter(null);
    setRatingFilter(null);
  };

  // Group filtered shelf products by category for the wash-day-style layout.
  const groups = useMemo(() => {
    const buckets = new Map<string, { label: string; items: UserProduct[] }>();
    for (const p of filteredProducts) {
      const { key, label } = categoryBucket(p.category);
      if (!buckets.has(key)) buckets.set(key, { label, items: [] });
      buckets.get(key)!.items.push(p);
    }
    const ordered: { key: string; label: string; items: UserProduct[] }[] = [];
    for (const b of CATEGORY_ORDER) {
      const bucket = buckets.get(b.key);
      if (bucket) ordered.push({ key: b.key, label: bucket.label, items: bucket.items });
    }
    const other = buckets.get("other");
    if (other) ordered.push({ key: "other", label: other.label, items: other.items });
    return ordered;
  }, [filteredProducts]);



  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
    toast.success("Removed from your records");
  };

  const handleToggleFavourite = async (p: UserProduct) => {
    const next = !p.on_favourite;
    await setFavourite(p.id, next);
    toast.success(next ? `${p.name} added to favourites` : `${p.name} removed from favourites`);
  };

  const goWishlist = () => navigate("/products/wishlist");
  const goIntel = () => navigate("/products/avoidlist");

  const handleLinkSubmit = async () => {
    await startUrlScan(linkValue, "shelf");
    setLinkSheetOpen(false);
    setLinkValue("");
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Products"
        back={false}
        right={
          <button onClick={() => navigate("/products/repository")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]">
            All Products
          </button>
        }
      />

      <div className="px-5 pb-4">
        <div className="grid grid-cols-5 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {tabs.map((t) => {
            const active = t.id === "shelf";
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "favourites") navigate("/products/favourites");
                  else if (t.id === "wishlist") navigate("/products/wishlist");
                  else if (t.id === "off-shelf") navigate("/products/off-shelf");
                  else if (t.id === "intel") navigate("/products/avoidlist");
                }}
                className={cn(
                  "py-2 text-[10px] rounded-md font-medium transition-colors min-h-[40px] truncate px-0.5",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-3 space-y-2">
        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, brand or ingredient…"
            className="h-10 pl-9 pr-9 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] font-medium transition-colors",
              filtersOpen || activeFilterCount > 0
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
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {filteredProducts.length} of {products.length}
          </span>
        </div>

        {filtersOpen && (
          <div className="rounded-[12px] border border-border bg-card p-3 space-y-3">
            {categoryOptions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptions.map((c) => {
                    const active = categoryFilter === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setCategoryFilter(active ? null : c.key)}
                        className={cn(
                          "h-7 px-2.5 rounded-full border text-[11px] transition-colors",
                          active
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
                    const active = brandFilter === b;
                    return (
                      <button
                        key={b}
                        onClick={() => setBrandFilter(active ? null : b)}
                        className={cn(
                          "h-7 px-2.5 rounded-full border text-[11px] transition-colors",
                          active
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
                  const active = ratingFilter === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setRatingFilter(active ? null : n)}
                      className={cn(
                        "h-7 px-2.5 rounded-full border text-[11px] transition-colors",
                        active
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

      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading your shelf…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="Your shelf is empty"
            hint="Scan or upload a product to get started."
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            message="No matches"
            hint="Try a different search or clear your filters."
          />
        ) : (
          groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1 pt-1">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                  {group.label}
                </h2>
                <span className="text-[10px] text-muted-foreground/70">
                  ({group.items.length})
                </span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              {group.items.map((p) => {
                const isOpen = expanded === p.product_key;
                const noteCount = counts[p.product_key] ?? 0;
                const stars = p.rating ?? 0;
                return (
                  <div
                    key={p.id}
                    className="bg-card border border-border rounded-[14px] overflow-hidden"
                  >
                    <div className="p-3.5 flex items-center gap-3">
                      <div className="size-12 rounded-[10px] overflow-hidden bg-transparent shrink-0">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="size-full object-contain mix-blend-multiply" />
                        ) : (
                          <div className="size-full flex items-center justify-center text-2xl bg-primary/15">🧴</div>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/products/profile/${p.id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Stars n={stars} />
                            {noteCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium">
                                <Mic className="size-3" /> {noteCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleToggleFavourite(p)}
                        className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                        aria-label={p.on_favourite ? "Remove from favourites" : "Add to favourites"}
                        aria-pressed={p.on_favourite}
                      >
                        <Heart
                          className={cn(
                            "size-4 transition-colors",
                            p.on_favourite ? "fill-current text-destructive" : "text-muted-foreground",
                          )}
                        />
                      </button>
                      <button
                        onClick={() => setExpanded(isOpen ? null : p.product_key)}
                        className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                        aria-label={isOpen ? "Hide voicenotes" : "Show voicenotes"}
                        aria-expanded={isOpen}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60 space-y-3">
                        <ProductVoicenotes
                          productKey={p.product_key}
                          productName={p.name}
                          productBrand={p.brand ?? ""}
                        />
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="goldOutline"
                            size="sm"
                            className="flex-1"
                            onClick={() => setOffShelfTarget({ id: p.id, key: p.product_key, name: p.name })}
                          >
                            <ArrowDownToLine className="size-3.5 mr-1" />
                            Take off shelf
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                            aria-label="Remove from app"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="px-5 pb-6 space-y-3">
        <FilePickerButton variant="gold" size="pill" preferCamera disabled={busy || urlBusy} onPick={(f) => startScan(f, "shelf")}>
          {busy ? "Preparing photo…" : "+ Scan a New Product"}
        </FilePickerButton>
        <FilePickerButton variant="goldOutline" size="pill" disabled={busy || urlBusy} onPick={(f) => startScan(f, "shelf")}>
          + Upload Screenshot
        </FilePickerButton>
        <Button
          variant="goldOutline"
          size="pill"
          disabled={busy || urlBusy}
          onClick={() => setLinkSheetOpen(true)}
          className="w-full"
        >
          <LinkIcon className="size-4 mr-1.5" />
          {urlBusy ? "Reading link…" : "Paste Web Link"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center leading-snug px-2">
          Tip: snap the bottle, upload a screenshot, or paste a product page
          link — the AI reads the label and matches ingredients to your hair
          profile.
        </p>
      </div>

      <MyToolsSection />

      <Sheet open={linkSheetOpen} onOpenChange={(o) => !urlBusy && setLinkSheetOpen(o)}>
        <SheetContent side="bottom" className="rounded-t-[24px] pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Add product from a link</SheetTitle>
            <SheetDescription className="text-xs">
              Paste a product page URL from any retailer or brand site. The AI
              will read the page and pull the ingredients.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Input
              type="url"
              inputMode="url"
              autoFocus
              placeholder="https://brand.com/products/curl-cream"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && linkValue.trim() && !urlBusy) handleLinkSubmit();
              }}
              disabled={urlBusy}
              className="h-12 text-sm"
            />
            <Button
              variant="gold"
              size="pill"
              onClick={handleLinkSubmit}
              disabled={!linkValue.trim() || urlBusy}
              className="w-full"
            >
              {urlBusy ? (
                <><Loader2 className="size-4 mr-2 animate-spin" /> Reading page…</>
              ) : (
                "Analyse this link"
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Works best with direct product pages (not search results or home
              pages). If a page hides ingredients behind a tab, the AI may
              return only what's visible.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {offShelfTarget && (
        <OffShelfReasonSheet
          open={!!offShelfTarget}
          onOpenChange={(o) => !o && setOffShelfTarget(null)}
          productId={offShelfTarget.id}
          productKey={offShelfTarget.key}
          productName={offShelfTarget.name}
          onComplete={async () => {
            setOffShelfTarget(null);
            await reload();
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this product?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{deleteTarget?.name}</strong> and all its history from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default Products;
