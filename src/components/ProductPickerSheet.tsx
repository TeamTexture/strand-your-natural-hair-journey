import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, Camera, ImagePlus, Link2, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import ProductThumb from "@/components/ProductThumb";
import MatchStars from "@/components/MatchStars";
import ShelfItemRemoveDialog from "@/components/ShelfItemRemoveDialog";
import SectionLabel from "@/components/SectionLabel";

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  groupProductsByCategory,
  type StepProductHint,
} from "@/lib/productCategories";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently selected product IDs */
  selectedIds: string[];
  /** Called when the user toggles a product on/off */
  onToggle: (productId: string) => void;
  /**
   * When provided, a pasted link is handed to the caller instead of taking the
   * member off to the analysis screen — used by style record steps, which
   * analyse in the background and attach the product when it lands.
   */
  onLinkSubmit?: (url: string) => void;
  /** Copy shown under the link field when the caller analyses in background. */
  linkHint?: string;
  /**
   * The wash-day step slot this picker was opened for. Used only to hoist the
   * categories that step usually needs to the top — every category still
   * renders, nothing is filtered. Omit where the step has no category field
   * (AI-generated style-record steps).
   */
  stepHint?: StepProductHint | null;
}



const Row = ({
  p,
  selected,
  onClick,
  onRemove,
}: {
  p: UserProduct;
  selected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) => (
  <div
    className={cn(
      "w-full p-3 flex items-center gap-3 rounded-[10px] border transition-colors",
      selected ? "border-primary bg-primary/5" : "border-border bg-card",
    )}
  >
    <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 text-left">
      <ProductThumb
        imageUrl={p.image_url}
        storagePath={p.storage_path}
        alt={p.name}
        cover
        wrapperClassName="size-10 rounded-[8px] overflow-hidden bg-secondary shrink-0"
      />
      <div className="flex-1 min-w-0">
        {/* Two lines before truncating — several shelf products share a long
            prefix ("Dove Scalp + Hair Therapy …") and were indistinguishable
            when clipped to one line. */}
        <p className="text-sm font-medium line-clamp-2 break-words">{p.name}</p>

        <div className="flex items-center gap-2 min-w-0">
          {p.brand && (
            <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
          )}
          <MatchStars item={p} />
        </div>
      </div>
      {selected && (
        <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Check className="size-3" />
        </span>
      )}
    </button>
    <button
      type="button"
      aria-label={`Remove ${p.name}`}
      onClick={onRemove}
      className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  </div>
);



const ProductPickerSheet = ({ open, onOpenChange, selectedIds, onToggle, onLinkSubmit, linkHint, stepHint }: Props) => {
  const [tab, setTab] = useState<"shelf" | "wishlist">("shelf");
  const [showAdd, setShowAdd] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [scanPreferCamera, setScanPreferCamera] = useState(true);
  const {
    products: shelf,
    loading: loadingShelf,
    setShelf,
    remove: deleteProduct,
    reload: reloadShelf,
  } = useUserProducts("shelf");
  const {
    products: wishlist,
    loading: loadingWishlist,
    setWishlist,
    reload: reloadWishlist,
  } = useUserProducts("wishlist");
  const [pendingRemove, setPendingRemove] = useState<UserProduct | null>(null);
  const [removing, setRemoving] = useState(false);

  const { startScan, busy: scanBusy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();
  const location = useLocation();
  const list = tab === "shelf" ? shelf : wishlist;
  const loading = tab === "shelf" ? loadingShelf : loadingWishlist;
  const isSelected = (id: string) => selectedIds.includes(id);

  // Sectioning only earns its keep on a long list — a two-item wishlist reads
  // better flat. Every product lands in exactly one section (null category →
  // "Other"), so the visible count always equals the tab label count.
  const SECTION_THRESHOLD = 6;
  const sections = useMemo(
    () => (list.length >= SECTION_THRESHOLD ? groupProductsByCategory(list, stepHint) : null),
    [list, stepHint],
  );


  // Two escape routes from the bin: keep the product in the app but off the
  // shelf/wishlist, or delete it from the app entirely. Both detach it from
  // this step first.
  const detach = (id: string) => {
    if (selectedIds.includes(id)) onToggle(id);
  };
  const takeOff = async (p: UserProduct) => {
    setRemoving(true);
    detach(p.id);
    if (tab === "shelf") await setShelf(p.id, false);
    else await setWishlist(p.id, false);
    await Promise.all([reloadShelf(), reloadWishlist()]);
    setRemoving(false);
    setPendingRemove(null);
    toast.success(tab === "shelf" ? "Taken off your shelf" : "Taken off your wishlist");
  };
  const hardDelete = async (p: UserProduct) => {
    setRemoving(true);
    detach(p.id);
    await deleteProduct(p.id);
    await Promise.all([reloadShelf(), reloadWishlist()]);
    setRemoving(false);
    setPendingRemove(null);
    toast.success("Removed from the app");
  };



  // Where to send the user back to (so the detail screen can return them
  // to the journal entry / wash step they were on). The detail screen also
  // reads `auto_save` to add the new product straight to the shelf.
  const returnTo = location.pathname + location.search;
  const navState = { intent: "shelf" as const, auto_save: true, returnTo };

  const openScan = (preferCamera: boolean) => {
    setScanPreferCamera(preferCamera);
    setScanSheetOpen(true);
  };
  const handleUrl = () => {
    if (!linkUrl.trim()) return;
    onOpenChange(false);
    if (onLinkSubmit) onLinkSubmit(linkUrl);
    else void startUrlScan(linkUrl, "shelf", navState);
    setLinkUrl("");
  };


  const busy = scanBusy || urlBusy;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px] max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Add products used</SheetTitle>
        </SheetHeader>

        {/* Add a new product — link / camera / upload. Anything added here
         *  is sent through the standard scan flow with auto_save so it lands
         *  on the user's shelf automatically. */}
        <div className="mt-3 rounded-[12px] border border-border bg-card p-3">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Add a new product
            </span>
            <span className="text-[11px] text-primary font-medium">{showAdd ? "Hide" : "Show"}</span>
          </button>

          {showAdd && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openScan(true)}
                  className="h-auto p-3 rounded-[10px] border border-dashed border-primary/50 bg-card text-center flex flex-col items-center justify-center disabled:opacity-50"
                >
                  <Camera className="size-5 mb-1 text-primary" />
                  <span className="text-[11px] font-medium">Take photos</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openScan(false)}
                  className="h-auto p-3 rounded-[10px] border border-dashed border-primary/50 bg-card text-center flex flex-col items-center justify-center disabled:opacity-50"
                >
                  <ImagePlus className="size-5 mb-1 text-primary" />
                  <span className="text-[11px] font-medium">Upload photos</span>
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Paste product link"
                    className="pl-8 h-10 text-sm"
                    disabled={busy}
                  />
                </div>
                <Button
                  onClick={handleUrl}
                  disabled={busy || !linkUrl.trim()}
                  className="h-10 px-3"
                  size="sm"
                >
                  {urlBusy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground leading-snug">
                {linkHint ??
                  "Added products are saved to your shelf automatically — you'll come right back here once we've analysed them."}
              </p>

            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 mt-3 bg-card border border-border rounded-[10px]">
          {(["shelf", "wishlist"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-2 text-xs rounded-md font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t === "shelf" ? `From Shelf (${shelf.length})` : `From Wishlist (${wishlist.length})`}
            </button>
          ))}
        </div>

        <div className="space-y-2 mt-3 pb-6">
          {loading ? (
            <LoadingDot label="Loading…" />
          ) : list.length === 0 ? (
            <EmptyState
              message={tab === "shelf" ? "No products on your shelf" : "Your wishlist is empty"}
              hint="Add a product above, or pick from the Products tab."
            />
          ) : sections ? (
            sections.map((s) => (
              <div key={s.slug} className="space-y-2">
                <SectionLabel className="!px-0 !mt-4 first:!mt-0 !mb-1.5">
                  {s.label}
                </SectionLabel>
                {s.products.map((p) => (
                  <Row
                    key={p.id}
                    p={p}
                    selected={isSelected(p.id)}
                    onClick={() => onToggle(p.id)}
                    onRemove={() => setPendingRemove(p)}
                  />
                ))}
              </div>
            ))
          ) : (
            list.map((p) => (
              <Row
                key={p.id}
                p={p}
                selected={isSelected(p.id)}
                onClick={() => onToggle(p.id)}
                onRemove={() => setPendingRemove(p)}
              />
            ))
          )}

        </div>
      </SheetContent>
    </Sheet>

    {pendingRemove && (
      <ShelfItemRemoveDialog
        open
        onOpenChange={(o) => { if (!o) setPendingRemove(null); }}
        name={pendingRemove.name}
        kind="product"
        list={tab}
        busy={removing}
        onTakeOff={() => void takeOff(pendingRemove)}
        onDelete={() => void hardDelete(pendingRemove)}
      />
    )}


    <DualPhotoCaptureSheet
      open={scanSheetOpen}
      onOpenChange={setScanSheetOpen}
      preferCamera={scanPreferCamera}
      busy={scanBusy}
      onSubmit={async (front, back) => {
        // Stay open (in its busy state) while the photos are prepared and
        // uploaded — closing first left a blank pause that read as a glitch.
        await startScan(front, back, "shelf", navState);
        setScanSheetOpen(false);
        onOpenChange(false);
      }}
    />

    </>
  );
};

export default ProductPickerSheet;
