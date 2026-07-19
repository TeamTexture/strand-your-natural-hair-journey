import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, Link as LinkIcon, Loader2, ArrowDownToLine, Trash2, Heart } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import MyToolsSection from "@/components/MyToolsSection";
import OffShelfReasonSheet from "@/components/OffShelfReasonSheet";
import ProductThumb from "@/components/ProductThumb";
import { UrlScanProgressButton } from "@/components/UrlScanProgressButton";
import ProductsHeader, {
  CATEGORY_ORDER,
  applyProductFilters,
  categoryBucket,
  useProductsFilterState,
} from "@/components/ProductsHeader";
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
import BrandLink from "@/components/BrandLink";

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
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [scanPreferCamera, setScanPreferCamera] = useState(true);
  const [offShelfTarget, setOffShelfTarget] = useState<{ id: string; key: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { products, loading, remove, reload, setFavourite } = useUserProducts("shelf");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();

  // Search + filter state (shared component)
  const filterState = useProductsFilterState();

  // Apply search + filters before grouping
  const filteredProducts = useMemo(
    () => applyProductFilters(products, filterState),
    [products, filterState.search, filterState.categoryFilter, filterState.brandFilter, filterState.ratingFilter],
  );

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

      <ProductsHeader
        active="shelf"
        products={products}
        filteredCount={filteredProducts.length}
        state={filterState}
      />

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
                const aiStars = p.match_score != null
                  ? Math.max(1, Math.min(5, Math.round(p.match_score / 20)))
                  : 0;
                const stars = p.rating ?? aiStars;

                return (
                  <div
                    key={p.id}
                    className="bg-card border border-border rounded-[14px] overflow-hidden"
                  >
                    <div className="p-3.5 flex items-center gap-3">
                      <ProductThumb
                        imageUrl={p.image_url}
                        storagePath={p.storage_path}
                        alt={p.name}
                        cover={!!p.storage_path}
                      />
                      <button
                        onClick={() => navigate(`/products/profile/${p.id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-body leading-snug break-words">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate"><BrandLink brand={p.brand} /></p>
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
        <Button
          variant="gold"
          size="pill"
          disabled={busy || urlBusy}
          onClick={() => { setScanPreferCamera(true); setScanSheetOpen(true); }}
          className="w-full"
        >
          {busy ? "Preparing photos…" : "+ Scan a New Product"}
        </Button>
        {/* The "Scan a New Product" sheet already lets users either take photos
            or pick from their library, so a separate "Upload" button would be
            redundant. */}
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
    </ScreenLayout>
  );
};

export default Products;
