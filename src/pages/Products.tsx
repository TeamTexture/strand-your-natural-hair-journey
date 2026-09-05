import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Link as LinkIcon, ArrowDownToLine, Trash2, Heart, Tag, FlaskConical } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import SectionLabel from "@/components/SectionLabel";

import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import MyToolsSection from "@/components/MyToolsSection";
import OffShelfReasonSheet from "@/components/OffShelfReasonSheet";
import ShelfProductCard from "@/components/product/ShelfProductCard";
import MatchStars from "@/components/MatchStars";
import { matchScoreOf } from "@/lib/matchStars";
import { UrlScanProgressButton } from "@/components/UrlScanProgressButton";
import ProductsHeader, {
  CATEGORY_ORDER,
  applyProductFilters,
  categoryBucket,
  useProductsFilterState,
} from "@/components/ProductsHeader";
import {
  useBatchSelection,
  SelectCheckbox,
  SelectToggleButton,
  BatchActionBar,
} from "@/components/BatchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { anchorProps } from "@/lib/scrollMemory";
import CategoryProductPanels from "@/components/CategoryProductPanels";
import { readViewPref, writeViewPref } from "@/lib/viewPrefs";
import { useAuth } from "@/hooks/useAuth";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";
import { toast } from "sonner";
import BrandLink from "@/components/BrandLink";
import BrandBanner from "@/components/BrandBanner";
import LevelGate from "@/components/tips/LevelGate";
import SensitivityCaptureCard from "@/components/sensitivity/SensitivityCaptureCard";
import SensitivitySheet from "@/components/sensitivity/SensitivitySheet";
import AvoidingSummary from "@/components/sensitivity/AvoidingSummary";
import { useSensitivityCapture } from "@/hooks/useSensitivityCapture";


const Products = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sensitivitySheet, setSensitivitySheet] = useState(false);
  const { open: sensitivityAsk, close: dismissSensitivityAsk } = useSensitivityCapture("topical");
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [scanPreferCamera, setScanPreferCamera] = useState(true);
  const [offShelfTarget, setOffShelfTarget] = useState<{ id: string; key: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmBulkOffShelf, setConfirmBulkOffShelf] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const {
    products, loading, remove, reload, setFavourite, sponsoredById,
    bulkSetShelf, bulkSetFavourite, bulkRemove,
  } = useUserProducts("shelf");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();
  const batch = useBatchSelection();
  const { user } = useAuth();

  const filterState = useProductsFilterState();

  const filteredProducts = useMemo(
    () => applyProductFilters(products, filterState),
    [products, filterState.search, filterState.categoryFilter, filterState.brandFilter, filterState.ratingFilter],
  );

  // Homemade products get their own section rather than being scattered
  // through the brand categories — she thinks of them as "the thing I made",
  // and their analysis is concentration-aware, so grouping them together keeps
  // that distinction visible. Same card treatment, so it is not second-class.
  const homemadeProducts = useMemo(
    () => filteredProducts.filter((p) => (p as UserProduct & { is_homemade?: boolean }).is_homemade),
    [filteredProducts],
  );

  const groups = useMemo(() => {
    const buckets = new Map<string, { label: string; items: UserProduct[] }>();
    for (const p of filteredProducts.filter(
      (x) => !(x as UserProduct & { is_homemade?: boolean }).is_homemade,
    )) {
      const { key, label } = categoryBucket(p.category, p.name);
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
    // Homemade mixes are NOT a category bucket — they render in their own
    // section below the shelf (no brand, no INCI panel, concentration-aware
    // analysis), so they must read as a distinct kind of thing.
    return ordered;
  }, [filteredProducts]);


  // Category panels open CLOSED so the page reads as a scannable list of
  // categories. What she opens is remembered for the session only (sessionStorage),
  // so stepping into a product and back doesn't re-collapse it, while a fresh
  // visit starts clean again.
  const expandedStorageKey = `strand:${user?.id ?? "anon"}:shelfExpandedCategories`;
  const readExpanded = (key: string): string[] => {
    try {
      const raw = sessionStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  };
  const [expandedCategories, setExpandedCategories] = useState<string[]>(() =>
    readExpanded(expandedStorageKey),
  );
  // Re-read once the signed-in user is known (auth resolves after first paint).
  useEffect(() => {
    setExpandedCategories(readExpanded(expandedStorageKey));
  }, [expandedStorageKey]);

  const toggleCategoryCollapsed = (slug: string) => {
    setExpandedCategories((prev) => {
      const next = prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug];
      try {
        sessionStorage.setItem(expandedStorageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable — session memory only */
      }
      return next;
    });
  };

  // The panel component is collapse-driven, so hand it everything she has NOT opened.
  const collapsedCategories = useMemo(
    () => groups.map((g) => g.key).filter((k) => !expandedCategories.includes(k)),
    [groups, expandedCategories],
  );


  // Search / filters run across EVERY product regardless of fold state; while
  // either is active the panels are forced open so a match in a collapsed group
  // still shows. Counts (tab total, filter counts) never look at fold state.
  const filtersActive = Boolean(
    filterState.search.trim() ||
      filterState.categoryFilter ||
      filterState.brandFilter ||
      filterState.ratingFilter,
  );


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

  const handleBulkFavourite = async (on: boolean) => {
    const n = batch.count;
    await bulkSetFavourite(batch.ids, on);
    toast.success(on
      ? `Added ${n} to favourites`
      : `Removed ${n} from favourites`);
    batch.exit();
  };

  const handleBulkOffShelf = async () => {
    const n = batch.count;
    await bulkSetShelf(batch.ids, false);
    setConfirmBulkOffShelf(false);
    toast.success(`Took ${n} product${n === 1 ? "" : "s"} off the shelf`);
    batch.exit();
  };

  const handleBulkDelete = async () => {
    const n = batch.count;
    await bulkRemove(batch.ids);
    setConfirmBulkDelete(false);
    toast.success(`Removed ${n} product${n === 1 ? "" : "s"}`);
    batch.exit();
  };

  const handleLinkSubmit = async () => {
    await startUrlScan(linkValue, "shelf");
    setLinkSheetOpen(false);
    setLinkValue("");
  };

  // Does the current selection already include any favourites? Used to
  // decide whether the batch bar shows "Favourite" or "Unfavourite".
  const anySelectedFavourite = useMemo(
    () => filteredProducts.some((p) => batch.selected.has(p.id) && p.on_favourite),
    [filteredProducts, batch.selected],
  );

  const renderProductRow = (p: UserProduct) => {
            const isOpen = expanded === p.product_key;
            const noteCount = counts[p.product_key] ?? 0;
            const isSelected = batch.selected.has(p.id);

            return (
                <ShelfProductCard
                  key={p.id}
                  anchor={anchorProps(p.id)}
                  className={cn(batch.selectMode && isSelected && "ring-2 ring-primary")}
                  name={p.name}
                  brand={<BrandLink brand={p.brand} />}
                  imageUrl={p.image_url}
                  storagePath={p.storage_path}
                  ingredients={p.ingredients}
                  matchScore={matchScoreOf(p)}
                  thumbBadge={
                    sponsoredById[p.id] ? (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-primary px-2 py-[3px] text-[9px] font-body font-semibold uppercase tracking-[0.12em] text-primary-foreground shadow-sm">
                        <Tag className="size-2.5" /> Offer
                      </span>
                    ) : undefined
                  }
                  onOpen={() => {
                    if (batch.selectMode) { batch.toggle(p.id); return; }
                    const sp = sponsoredById[p.id];
                    if (sp && p.linked_brand_product_id) {
                      navigate(`/offers/${sp.offerId}/product/${sp.brandProductId}`);
                      return;
                    }
                    if (sp) { navigate(`/offers/${sp.offerId}`); return; }
                    navigate(`/products/profile/${p.id}`);
                  }}
                  leading={
                    batch.selectMode ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); batch.toggle(p.id); }}
                        className="shrink-0 mt-0.5"
                        aria-label={isSelected ? "Deselect" : "Select"}
                      >
                        <SelectCheckbox checked={isSelected} />
                      </button>
                    ) : undefined
                  }
                  meta={
                    <>
                      <MatchStars item={p} ingredients={p.ingredients} />
                      {noteCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium">
                          <Mic className="size-3" /> {noteCount}
                        </span>
                      )}
                    </>
                  }
                  banner={
                    sponsoredById[p.id] ? (
                      <button
                        type="button"
                        onClick={() => {
                          const sp = sponsoredById[p.id];
                          if (p.linked_brand_product_id) navigate(`/offers/${sp.offerId}/product/${sp.brandProductId}`);
                          else navigate(`/offers/${sp.offerId}`);
                        }}
                        className="w-full flex items-center gap-2.5 rounded-[12px] border border-primary/35 bg-primary/[0.08] px-3 py-2.5 text-left hover:bg-primary/[0.13] transition-colors"
                      >
                        <Tag className="size-4 text-primary shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-body font-semibold text-primary leading-tight truncate">
                            Live offer
                            {sponsoredById[p.id].discountCode ? ` · code ${sponsoredById[p.id].discountCode}` : ""}
                          </span>
                          <span className="block text-[10.5px] text-muted-foreground leading-tight truncate mt-0.5">
                            Tap to view the offer &amp; buy
                            {sponsoredById[p.id].endsOn ? ` — ends ${new Date(sponsoredById[p.id].endsOn!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-primary shrink-0" />
                      </button>
                    ) : undefined
                  }
                  headerActions={
                    !batch.selectMode ? (
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
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
                    ) : undefined
                  }
                >
                  {!batch.selectMode && isOpen && (
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
                </ShelfProductCard>
            );
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="My Products" back={false} tips />

      <div className="px-5 pb-2 space-y-2">
        {sensitivityAsk && (
          <SensitivityCaptureCard
            scope="topical"
            onOpen={() => {
              dismissSensitivityAsk();
              setSensitivitySheet(true);
            }}
            onLater={() => dismissSensitivityAsk()}
          />
        )}
        <AvoidingSummary scope="topical" onEdit={() => setSensitivitySheet(true)} />
        <BrandBanner slot="products" />
      </div>
      <SensitivitySheet
        scope="topical"
        open={sensitivitySheet}
        onOpenChange={setSensitivitySheet}
      />




      <div className="px-5 flex items-center justify-between gap-2 pb-2">
        {products.length > 0 ? (
          <SelectToggleButton
            selectMode={batch.selectMode}
            onEnter={() => batch.enter()}
            onExit={batch.exit}
          />
        ) : (
          <span />
        )}
        {!batch.selectMode && (
          <button
            onClick={() => navigate("/products/repository")}
            className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]"
          >
            All Products
          </button>
        )}
      </div>

      {!batch.selectMode && (
        <div className="px-5 pb-4 space-y-3">
          <Button
            variant="gold"
            size="pill"
            disabled={busy || urlBusy}
            onClick={() => { setScanPreferCamera(true); setScanSheetOpen(true); }}
            className="w-full"
          >
            {busy ? "Preparing photos…" : "+ Scan a New Product"}
          </Button>
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
          <Button
            variant="goldOutline"
            size="pill"
            onClick={() => navigate("/products/homemade/new")}
            className="w-full"
          >
            <FlaskConical className="size-4 mr-1.5" />
            Add Homemade Product
          </Button>
          <LevelGate min={2}>
            <p className="text-[11px] text-muted-foreground text-center leading-snug px-2">
              Tip: snap the bottle, upload a screenshot, or paste a product page
              link — the AI reads the label and matches ingredients to your hair
              profile.
            </p>
          </LevelGate>
        </div>
      )}

      <ProductsHeader
        active="shelf"
        products={products}
        filteredCount={filteredProducts.length}
        state={filterState}
      />




      <div className={cn("px-5 space-y-3 pb-4", batch.selectMode && "pb-40")}>
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
          <>
            {groups.length > 0 && (
              <CategoryProductPanels
                products={filteredProducts.filter(
                  (x) => !(x as UserProduct & { is_homemade?: boolean }).is_homemade,
                )}
                sections={groups.map((g) => ({ slug: g.key, label: g.label, products: g.items }))}
                // Her own shelf: everything OPEN on arrival, collapsing is opt-in.
                defaultOpen="all"
                flatBelow={0}
                countStyle="parens"
                collapsedSlugs={collapsedCategories}
                onToggleCollapsed={toggleCategoryCollapsed}
                // A search or filter must never be defeated by a fold: while either
                // is active every panel is forced open, so a match is always visible.
                forceOpen={filtersActive}
                sectionId={(slug) => `section-products-${slug}`}
                renderRow={renderProductRow}
              />
            )}

            {homemadeProducts.length > 0 && (
              <section
                id="section-products-homemade"
                className="rounded-[18px] border border-primary/30 bg-primary/[0.05] p-3 space-y-2.5 mt-1"
              >
                <div className="flex items-center gap-2 px-0.5">
                  <FlaskConical className="size-4 text-primary shrink-0" />
                  <SectionLabel className="!mt-0 !mb-0 !px-0">
                    My homemade mixes ({homemadeProducts.length})
                  </SectionLabel>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug px-0.5">
                  Made by you — no label to read, so the analysis works from your
                  recipe and how much of each thing went in.
                </p>
                <div className="space-y-3">
                  {homemadeProducts.map(renderProductRow)}
                </div>
              </section>
            )}
          </>
        )}


      </div>

      {!batch.selectMode && <MyToolsSection />}

      {batch.selectMode && (
        <BatchActionBar
          count={batch.count}
          totalVisible={filteredProducts.length}
          onSelectAll={() => batch.selectAll(filteredProducts.map((p) => p.id))}
          onClear={batch.clear}
          actions={[
            {
              key: "offshelf",
              label: "Off shelf",
              icon: <ArrowDownToLine className="size-4" />,
              onClick: () => setConfirmBulkOffShelf(true),
            },
            {
              key: "favourite",
              label: anySelectedFavourite ? "Unfavourite" : "Favourite",
              icon: <Heart className={cn("size-4", anySelectedFavourite && "fill-current text-destructive")} />,
              onClick: () => handleBulkFavourite(!anySelectedFavourite),
            },
            {
              key: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setConfirmBulkDelete(true),
            },
          ]}
        />
      )}

      <DualPhotoCaptureSheet
        open={scanSheetOpen}
        onOpenChange={setScanSheetOpen}
        preferCamera={scanPreferCamera}
        busy={busy}
        onSubmit={async (front, back) => {
          setScanSheetOpen(false);
          await startScan(front, back, "shelf");
        }}
      />

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
            <UrlScanProgressButton
              busy={urlBusy}
              disabled={!linkValue.trim() || urlBusy}
              onClick={handleLinkSubmit}
              className="w-full"
            />
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

      <AlertDialog open={confirmBulkOffShelf} onOpenChange={setConfirmBulkOffShelf}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take {batch.count} off the shelf?</AlertDialogTitle>
            <AlertDialogDescription>
              These products will move to your Off Shelf list. Their voicenotes and history stay attached — you can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkOffShelf}>Take off shelf</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {batch.count} product{batch.count === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected products and all their history from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
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
