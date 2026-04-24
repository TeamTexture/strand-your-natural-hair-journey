import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";

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
    {p.match_score != null && (
      <span className="text-[10px] font-bold text-primary shrink-0">{p.match_score}</span>
    )}
    {selected && (
      <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
        <Check className="size-3" />
      </span>
    )}
  </button>
);

const ProductPickerSheet = ({ open, onOpenChange, selectedIds, onToggle }: Props) => {
  const [tab, setTab] = useState<"shelf" | "wishlist">("shelf");
  const { products: shelf, loading: loadingShelf } = useUserProducts("shelf");
  const { products: wishlist, loading: loadingWishlist } = useUserProducts("wishlist");
  const list = tab === "shelf" ? shelf : wishlist;
  const loading = tab === "shelf" ? loadingShelf : loadingWishlist;
  const isSelected = (id: string) => selectedIds.includes(id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px] max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Add products used</SheetTitle>
        </SheetHeader>

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
              hint="Add products from the Products tab to attach them to journal entries."
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
