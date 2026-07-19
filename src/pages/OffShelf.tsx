import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, RotateCcw, Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import ProductThumb from "@/components/ProductThumb";
import ProductsHeader, {
  applyProductFilters,
  useProductsFilterState,
} from "@/components/ProductsHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { toast } from "sonner";
import BrandLink from "@/components/BrandLink";

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const OffShelf = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { products, loading, setShelf, remove } = useUserProducts("off-shelf");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));

  const filterState = useProductsFilterState();
  const filteredProducts = useMemo(
    () => applyProductFilters(products, filterState),
    [products, filterState.search, filterState.categoryFilter, filterState.brandFilter, filterState.ratingFilter],
  );

  const handleRestore = async () => {
    if (!restoreId) return;
    await setShelf(restoreId, true);
    setRestoreId(null);
    toast.success("Moved back to shelf");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await remove(deleteId);
    setDeleteId(null);
    toast.success("Removed from your records");
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Off The Shelf" back />

      <ProductsHeader
        active="off-shelf"
        products={products}
        filteredCount={filteredProducts.length}
        state={filterState}
      />

      <div className="px-5 pb-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Products you've taken off your shelf — keep a record of what didn't
          work so the AI can steer future picks away from similar formulas.
        </p>
      </div>

      <div className="px-5 space-y-3 pb-8">
        {loading ? (
          <LoadingDot label="Loading off-shelf products…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="Nothing off the shelf yet"
            hint="When you remove a product from your shelf it'll show up here."
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
            const stars = p.rating ?? 0;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-[14px] overflow-hidden opacity-90"
              >
                <div className="p-3.5 flex items-center gap-3">
                  <div className="grayscale">
                    <ProductThumb
                      imageUrl={p.image_url}
                      storagePath={p.storage_path}
                      alt={p.name}
                      cover={!!p.storage_path}
                    />
                  </div>
                  <button
                    onClick={() => navigate(`/products/profile/${p.id}`)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate"><BrandLink brand={p.brand} /></p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars n={stars} />
                        {noteCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium">
                            <Mic className="size-3" /> {noteCount}
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80">
                          Off shelf
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.product_key)}
                    className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                    aria-label={isOpen ? "Hide details" : "Show details"}
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
                    {p.ai_summary && (
                      <p className="text-[12px] text-muted-foreground leading-snug">
                        {p.ai_summary}
                      </p>
                    )}
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
                        onClick={() => setRestoreId(p.id)}
                      >
                        <RotateCcw className="size-3.5 mr-1" />
                        Back to Shelf
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteId(p.id)}
                        aria-label="Delete record"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={!!restoreId} onOpenChange={(o) => !o && setRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move back to shelf?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll add this product back to your active shelf. Your voicenotes
              and rating stay attached.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Move to shelf</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product, voicenotes and rating. The
              AI will lose this signal when picking new products for you.
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

export default OffShelf;
