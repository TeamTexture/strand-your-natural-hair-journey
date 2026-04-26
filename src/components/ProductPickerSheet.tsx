import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, Camera, ImagePlus, Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import FilePickerButton from "@/components/FilePickerButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently selected product IDs */
  selectedIds: string[];
  /** Called when the user toggles a product on/off */
  onToggle: (productId: string) => void;
}

const Row = ({ p, selected, onClick }: { p: UserProduct; selected: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full p-3 flex items-center gap-3 text-left rounded-[10px] border transition-colors",
      selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
    )}
  >
    <div className="size-10 rounded-[8px] overflow-hidden bg-secondary shrink-0">
      {p.image_url ? (
        <img src={p.image_url} alt="" className="size-full object-cover" />
      ) : (
        <div className="size-full flex items-center justify-center text-lg bg-primary/15">🧴</div>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{p.name}</p>
      <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
    </div>
    {selected && (
      <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
        <Check className="size-3" />
      </span>
    )}
  </button>
);

const ProductPickerSheet = ({ open, onOpenChange, selectedIds, onToggle }: Props) => {
  const [tab, setTab] = useState<"shelf" | "wishlist">("shelf");
  const [showAdd, setShowAdd] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const { products: shelf, loading: loadingShelf } = useUserProducts("shelf");
  const { products: wishlist, loading: loadingWishlist } = useUserProducts("wishlist");
  const { startScan, busy: scanBusy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();
  const location = useLocation();
  const list = tab === "shelf" ? shelf : wishlist;
  const loading = tab === "shelf" ? loadingShelf : loadingWishlist;
  const isSelected = (id: string) => selectedIds.includes(id);

  // Where to send the user back to (so the detail screen can return them
  // to the journal entry / wash step they were on). The detail screen also
  // reads `auto_save` to add the new product straight to the shelf.
  const returnTo = location.pathname + location.search;
  const navState = { intent: "shelf" as const, auto_save: true, returnTo };

  const handlePhoto = (file: File) => {
    onOpenChange(false);
    void startScan(file, "shelf", navState);
  };
  const handleUrl = () => {
    if (!linkUrl.trim()) return;
    onOpenChange(false);
    void startUrlScan(linkUrl, "shelf", navState);
    setLinkUrl("");
  };

  const busy = scanBusy || urlBusy;

  return (
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
                <FilePickerButton
                  variant="goldGhost"
                  preferCamera
                  disabled={busy}
                  onPick={handlePhoto}
                  className="!h-auto !p-3 !rounded-[10px] border border-dashed border-primary/50 bg-card text-center flex-col"
                >
                  <Camera className="size-5 mb-1 text-primary" />
                  <span className="text-[11px] font-medium">Take a photo</span>
                </FilePickerButton>
                <FilePickerButton
                  variant="goldGhost"
                  disabled={busy}
                  onPick={handlePhoto}
                  className="!h-auto !p-3 !rounded-[10px] border border-dashed border-primary/50 bg-card text-center flex-col"
                >
                  <ImagePlus className="size-5 mb-1 text-primary" />
                  <span className="text-[11px] font-medium">Upload photo</span>
                </FilePickerButton>
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
                Added products are saved to your shelf automatically — you'll come right back here once we've analysed them.
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
          ) : (
            list.map((p) => (
              <Row
                key={p.id}
                p={p}
                selected={isSelected(p.id)}
                onClick={() => onToggle(p.id)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ProductPickerSheet;
