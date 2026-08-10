import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import ProductThumb from "@/components/ProductThumb";

/**
 * Picks a product the member already keeps on their shelf, so a treatment plan
 * reuses the analysis, brand and image they've already captured rather than
 * asking them to retype it.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ids already on the plan — shown as unavailable. */
  usedIds?: string[];
  onPick: (product: UserProduct) => void;
}

const ShelfProductPicker = ({ open, onOpenChange, usedIds = [], onPick }: Props) => {
  const { products, loading } = useUserProducts("shelf");
  const [term, setTerm] = useState("");

  const list = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q),
    );
  }, [products, term]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-[20px]">From your shelf</SheetTitle>
          <SheetDescription className="font-body text-[12.5px]">
            Tap a product to add it to this plan.
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-3">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search your shelf"
            className="pl-9"
          />
        </div>

        <div className="mt-3 space-y-1.5 pb-6">
          {loading && (
            <p className="font-body text-[13px] text-muted-foreground py-4 text-center">
              Loading your shelf…
            </p>
          )}
          {!loading && list.length === 0 && (
            <p className="font-body text-[13px] text-muted-foreground py-4 text-center">
              {products.length === 0
                ? "Nothing on your shelf yet — paste a product link instead."
                : "No match on your shelf."}
            </p>
          )}
          {list.map((p) => {
            const used = usedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={used}
                onClick={() => {
                  onPick(p);
                  onOpenChange(false);
                }}
                className={
                  "w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left transition-colors " +
                  (used ? "opacity-50" : "active:bg-muted")
                }
              >
                <ProductThumb
                  imageUrl={p.image_url}
                  storagePath={p.storage_path}
                  alt={p.name}
                  brand={p.brand}
                  name={p.name}
                  wrapperClassName="size-11 rounded-xl overflow-hidden bg-secondary shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-body text-[13.5px] font-semibold text-foreground break-words">
                    {p.name}
                  </p>
                  {p.brand && (
                    <p className="font-body text-[11.5px] text-muted-foreground">{p.brand}</p>
                  )}
                </div>
                {used && (
                  <span className="font-body text-[11px] text-muted-foreground shrink-0">Added</span>
                )}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ShelfProductPicker;
