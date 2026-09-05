// THE DAILY LOG'S ONE ADD ACTION.
//
// The daily log used to open on a long scroll of product cards, which is more
// scrolling than choosing. It now opens on a single "Add product" button, and
// this sheet is what that button offers: three routes, stated plainly.
//
//   1. Scan a product   → the existing photo scan flow (useProductScan)
//   2. Add by link      → the existing link scan flow (useProductUrlScan)
//   3. Select from shelf → the collapsed category picker below
//
// No scanning logic lives here. Both routes hand off to the same hooks the
// Products screen and the wash-day picker already use, with auto_save so the
// product lands on her shelf and the flow returns her to the daily log with
// the new product already attached.
//
// The shelf route is deliberately the SAME collapse behaviour as the Products
// screen: every category closed on arrival, name + count + chevron, one panel
// opened by choice, and a search that forces every panel open so a match can
// never hide inside a fold. She can add several products before returning, so
// logging two things is one trip rather than two.

import { useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, ImagePlus, Link2, Loader2, Search, ShoppingBag } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ProductThumb from "@/components/ProductThumb";
import MatchStars from "@/components/MatchStars";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import CategoryProductPanels from "@/components/CategoryProductPanels";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";
import { categoryBucket, CATEGORY_ORDER } from "@/components/ProductsHeader";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Product IDs already on this entry. */
  selectedIds: string[];
  /** Adds/removes a product on the entry. */
  onToggle: (productId: string) => void;
  /** Where a scan/link flow should return her once the product is saved. */
  returnTo: string;
}

type Mode = "choices" | "shelf" | "link";

/** One choice row — icon, label, one line of what it does. */
const ChoiceRow = ({
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 rounded-[14px] border border-border bg-card p-3.5 text-left min-h-[64px] disabled:opacity-50"
  >
    <span className="size-9 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
      {icon}
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-[11px] uppercase tracking-[0.14em] font-semibold font-body text-foreground">
        {title}
      </span>
      <span className="block font-body text-[11.5px] text-muted-foreground leading-snug break-words">
        {hint}
      </span>
    </span>
  </button>
);

/** A shelf row in the picker: thumbnail, full name (never truncated), Add. */
const PickerRow = ({
  p,
  selected,
  onClick,
}: {
  p: UserProduct;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      "w-full p-3 flex items-center gap-3 rounded-[10px] border text-left transition-colors",
      selected ? "border-primary bg-primary/5" : "border-border bg-card",
    )}
  >
    <ProductThumb
      imageUrl={p.image_url}
      storagePath={p.storage_path}
      alt={p.name}
      cover
      wrapperClassName="size-10 rounded-[8px] overflow-hidden bg-secondary shrink-0"
    />
    <span className="flex-1 min-w-0">
      <span className="block product-title text-[12px] leading-snug break-words [overflow-wrap:anywhere]">
        {p.name}
      </span>
      <span className="flex items-center gap-2 min-w-0">
        {p.brand && (
          <span className="font-body text-[11px] text-muted-foreground break-words">{p.brand}</span>
        )}
        <MatchStars item={p} />
      </span>
    </span>
    <span
      className={cn(
        "shrink-0 min-h-[32px] px-3 rounded-full text-[11px] font-medium border inline-flex items-center gap-1",
        selected
          ? "bg-primary/15 text-primary border-primary/40"
          : "bg-primary text-primary-foreground border-primary",
      )}
    >
      {selected && <Check className="size-3" aria-hidden />}
      {selected ? "Added" : "Add"}
    </span>
  </button>
);

const AddProductSheet = ({ open, onOpenChange, selectedIds, onToggle, returnTo }: Props) => {
  const [mode, setMode] = useState<Mode>("choices");
  const [query, setQuery] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [scanPreferCamera, setScanPreferCamera] = useState(true);

  const { products: shelf, loading } = useUserProducts("shelf");
  const { startScan, busy: scanBusy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();
  const busy = scanBusy || urlBusy;

  // The scan/link routes save to the shelf and come back here with the new
  // product attached to the entry — the same auto_save contract the wash-day
  // picker uses. Nothing about the scan itself changes.
  const navState = { intent: "shelf" as const, auto_save: true, returnTo };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shelf;
    return shelf.filter((p) =>
      `${p.name} ${p.brand ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q),
    );
  }, [shelf, query]);

  // Same buckets and order as the Products screen, so a category reads in the
  // same place with the same count. Labels are uppercased to match the other
  // collapsed sections; product names keep their own casing.
  const sections = useMemo(() => {
    const buckets = new Map<string, { label: string; items: UserProduct[] }>();
    for (const p of filtered) {
      const { key, label } = categoryBucket(p.category, p.name);
      if (!buckets.has(key)) buckets.set(key, { label, items: [] });
      buckets.get(key)!.items.push(p);
    }
    const ordered: { slug: string; label: string; products: UserProduct[] }[] = [];
    for (const b of CATEGORY_ORDER) {
      const bucket = buckets.get(b.key);
      if (bucket)
        ordered.push({ slug: b.key, label: bucket.label.toUpperCase(), products: bucket.items });
    }
    const other = buckets.get("other");
    if (other)
      ordered.push({ slug: "other", label: other.label.toUpperCase(), products: other.items });
    return ordered;
  }, [filtered]);

  const close = () => {
    onOpenChange(false);
    // Reset on the way out so the sheet always reopens on the three choices.
    setTimeout(() => {
      setMode("choices");
      setQuery("");
      setLinkUrl("");
    }, 200);
  };

  const submitLink = () => {
    if (!linkUrl.trim()) return;
    onOpenChange(false);
    void startUrlScan(linkUrl, "shelf", navState);
    setLinkUrl("");
    setMode("choices");
  };

  const addedCount = selectedIds.length;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <SheetContent side="bottom" className="rounded-t-[20px] max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display flex items-center gap-2">
              {mode !== "choices" && (
                <button
                  type="button"
                  aria-label="Back"
                  onClick={() => setMode("choices")}
                  className="size-7 -ml-1 rounded-full flex items-center justify-center text-primary shrink-0"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
              )}
              {mode === "shelf" ? "Your shelf" : mode === "link" ? "Add by link" : "Add product"}
            </SheetTitle>
          </SheetHeader>

          {/* THE THREE ROUTES. */}
          {mode === "choices" && (
            <div className="mt-3 space-y-2 pb-6">
              <ChoiceRow
                icon={<Camera className="size-4" aria-hidden />}
                title="Scan a product"
                hint="Photograph the front and the ingredients panel"
                disabled={busy}
                onClick={() => {
                  setScanPreferCamera(true);
                  setScanSheetOpen(true);
                }}
              />
              <ChoiceRow
                icon={<ImagePlus className="size-4" aria-hidden />}
                title="Upload photos"
                hint="Use photos already on your phone"
                disabled={busy}
                onClick={() => {
                  setScanPreferCamera(false);
                  setScanSheetOpen(true);
                }}
              />
              <ChoiceRow
                icon={<Link2 className="size-4" aria-hidden />}
                title="Add by link"
                hint="Paste the product page and we'll read it"
                disabled={busy}
                onClick={() => setMode("link")}
              />
              <ChoiceRow
                icon={<ShoppingBag className="size-4" aria-hidden />}
                title="Select from my shelf"
                hint={`Pick from the ${shelf.length} product${shelf.length === 1 ? "" : "s"} you already keep`}
                onClick={() => setMode("shelf")}
              />
            </div>
          )}

          {/* ADD BY LINK — the existing URL scan, nothing new. */}
          {mode === "link" && (
            <div className="mt-3 space-y-3 pb-6">
              <div className="relative">
                <Link2
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="Paste product link"
                  className="pl-8 h-11 text-sm rounded-[10px]"
                  disabled={busy}
                  autoFocus
                />
              </div>
              <Button variant="gold" size="pill" onClick={submitLink} disabled={busy || !linkUrl.trim()}>
                {urlBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add by link"}
              </Button>
              <p className="font-body text-[11px] text-muted-foreground leading-snug">
                It's saved to your shelf and added to today's log once we've read it.
              </p>
            </div>
          )}

          {/* SELECT FROM MY SHELF — every category closed, opened by choice. */}
          {mode === "shelf" && (
            <div className="mt-3 pb-6">
              <div className="relative mb-3">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your products"
                  className="pl-8 h-11 text-sm rounded-[10px]"
                />
              </div>

              {loading ? (
                <LoadingDot label="Loading…" />
              ) : shelf.length === 0 ? (
                <EmptyState
                  message="No products on your shelf yet"
                  hint="Scan a product or add one by link and it'll be here next time."
                />
              ) : filtered.length === 0 ? (
                <EmptyState message="Nothing matches that" hint="Try a shorter search." />
              ) : (
                <CategoryProductPanels
                  products={filtered}
                  sections={sections}
                  selectedIds={selectedIds}
                  // Closed on arrival, always panelled, "(8)" counts — exactly
                  // how the Products screen behaves. A search forces every
                  // panel open so a match can never hide in a fold.
                  defaultOpen="none"
                  flatBelow={0}
                  countStyle="parens"
                  forceOpen={!!query.trim()}
                  renderRow={(p) => (
                    <PickerRow
                      p={p}
                      selected={selectedIds.includes(p.id)}
                      onClick={() => onToggle(p.id)}
                    />
                  )}
                />
              )}

              {/* Several products, one trip back. */}
              <div className="sticky bottom-0 pt-3 bg-background">
                <Button variant="gold" size="pill" onClick={close} disabled={addedCount === 0}>
                  {addedCount === 0
                    ? "Done"
                    : `Done — ${addedCount} product${addedCount === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* The existing scan capture sheet and the existing scan hook. */}
      <DualPhotoCaptureSheet
        open={scanSheetOpen}
        onOpenChange={setScanSheetOpen}
        preferCamera={scanPreferCamera}
        busy={scanBusy}
        onSubmit={async (front, back) => {
          await startScan(front, back, "shelf", navState);
          setScanSheetOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
};

export default AddProductSheet;
