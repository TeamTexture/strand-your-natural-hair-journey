import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, Link as LinkIcon, Loader2, ArrowUpFromLine, Trash2 } from "lucide-react";
import {
  useBatchSelection,
  SelectCheckbox,
  SelectToggleButton,
  BatchActionBar,
} from "@/components/BatchSelect";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import ProductThumb from "@/components/ProductThumb";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import { UrlScanProgressButton } from "@/components/UrlScanProgressButton";
import ProductsHeader, {
  applyProductFilters,
  useProductsFilterState,
} from "@/components/ProductsHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";
import BrandLink from "@/components/BrandLink";

const Wishlist = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [scanPreferCamera, setScanPreferCamera] = useState(true);
  const { products, loading } = useUserProducts("wishlist");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();

  const filterState = useProductsFilterState();
  const filteredProducts = useMemo(
    () => applyProductFilters(products, filterState),
    [products, filterState.search, filterState.categoryFilter, filterState.brandFilter, filterState.ratingFilter],
  );

  const handleLinkSubmit = async () => {
    await startUrlScan(linkValue, "wishlist");
    setLinkSheetOpen(false);
    setLinkValue("");
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Wishlist" />

      <ProductsHeader
        active="wishlist"
        products={products}
        filteredCount={filteredProducts.length}
        state={filterState}
      />

      <div className="px-5 pb-5 space-y-3">
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

      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading your wishlist…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="Your wishlist is empty"
            hint="Scan, upload, or paste a link above to add a product to your wishlist."
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            message="No matches"
            hint="Try a different search or clear your filters."
          />
        ) : (
          filteredProducts.map((p) => {
            const isOpen = expanded === p.product_key;
            const noteCount = counts[p.product_key] ?? 0;
            return (
              <SurfaceCard key={p.id} padded={false} className="overflow-hidden">
                <div className="p-3.5 flex items-center gap-3">
                  <ProductThumb
                    imageUrl={p.image_url}
                    storagePath={p.storage_path}
                    alt={p.name}
                    cover={!!p.storage_path}
                  />
                  <button
                    onClick={() => navigate(`/products/profile/${p.id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate"><BrandLink brand={p.brand} /></p>
                    {noteCount > 0 && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary font-medium">
                        <Mic className="size-3" /> {noteCount} note{noteCount === 1 ? "" : "s"}
                      </span>
                    )}
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
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60">
                    <ProductVoicenotes
                      productKey={p.product_key}
                      productName={p.name}
                      productBrand={p.brand ?? ""}
                    />
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>

      <Sheet open={linkSheetOpen} onOpenChange={(o) => !urlBusy && setLinkSheetOpen(o)}>
        <SheetContent side="bottom" className="rounded-t-[24px] pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Add product from a link</SheetTitle>
            <SheetDescription className="text-xs">
              Paste a product page URL from any retailer or brand site. The AI
              will read the page and pull the ingredients into your wishlist.
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

      <DualPhotoCaptureSheet
        open={scanSheetOpen}
        onOpenChange={setScanSheetOpen}
        preferCamera={scanPreferCamera}
        busy={busy}
        onSubmit={async (front, back) => {
          setScanSheetOpen(false);
          await startScan(front, back, "wishlist");
        }}
      />
    </ScreenLayout>
  );
};

export default Wishlist;
