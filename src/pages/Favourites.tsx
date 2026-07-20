import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, Heart, ArrowDownToLine, Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import ProductThumb from "@/components/ProductThumb";
import ProductsHeader, {
  applyProductFilters,
  useProductsFilterState,
} from "@/components/ProductsHeader";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { toast } from "sonner";
import BrandLink from "@/components/BrandLink";

const Favourites = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { products, loading, setFavourite, bulkSetFavourite, bulkSetShelf, bulkRemove } =
    useUserProducts("favourite");
  const { counts } = useVoicenoteCounts(products.map((p) => p.product_key));
  const batch = useBatchSelection();

  const filterState = useProductsFilterState();
  const filteredProducts = useMemo(
    () => applyProductFilters(products, filterState),
    [products, filterState.search, filterState.categoryFilter, filterState.brandFilter, filterState.ratingFilter],
  );

  const handleUnfavourite = async (id: string, name: string) => {
    await setFavourite(id, false);
    toast(`Removed ${name} from favourites`);
  };

  const handleBulkUnfavourite = async () => {
    const n = batch.count;
    await bulkSetFavourite(batch.ids, false);
    toast.success(`Removed ${n} from favourites`);
    batch.exit();
  };

  const handleBulkOffShelf = async () => {
    const n = batch.count;
    await bulkSetShelf(batch.ids, false);
    toast.success(`Took ${n} product${n === 1 ? "" : "s"} off the shelf`);
    batch.exit();
  };

  const handleBulkDelete = async () => {
    const n = batch.count;
    await bulkRemove(batch.ids);
    setConfirmDelete(false);
    toast.success(`Removed ${n} product${n === 1 ? "" : "s"}`);
    batch.exit();
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Favourites"
        right={
          products.length > 0 ? (
            <SelectToggleButton
              selectMode={batch.selectMode}
              onEnter={() => batch.enter()}
              onExit={batch.exit}
            />
          ) : undefined
        }
      />

      <ProductsHeader
        active="favourites"
        products={products}
        filteredCount={filteredProducts.length}
        state={filterState}
      />

      <div className="px-5 pb-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Tap the <Heart className="inline size-3 -mt-0.5 fill-current text-destructive" /> on any
          product to add it here. When the same ingredient appears in 3 or more of your favourites that
          are on your shelf, it earns a{" "}
          <span className="font-medium" style={{ color: "hsl(40 65% 32%)" }}>gold flag</span> on the
          Ingredients page — purely educational, so you can see what's recurring across the products you actually use and love.
        </p>
      </div>

      <div className={cn("px-5 space-y-3 pb-4", batch.selectMode && "pb-40")}>
        {loading ? (
          <LoadingDot label="Loading your favourites…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="No favourites yet"
            hint="Open any product and tap the heart to add it to your favourites."
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
            const isSelected = batch.selected.has(p.id);
            return (
              <SurfaceCard
                key={p.id}
                padded={false}
                className={cn(
                  "overflow-hidden transition-colors",
                  batch.selectMode && isSelected && "ring-2 ring-primary",
                )}
              >
                <div className="p-3.5 flex items-center gap-3">
                  {batch.selectMode && (
                    <button
                      onClick={() => batch.toggle(p.id)}
                      className="shrink-0"
                      aria-label={isSelected ? "Deselect" : "Select"}
                    >
                      <SelectCheckbox checked={isSelected} />
                    </button>
                  )}
                  <ProductThumb
                    imageUrl={p.image_url}
                    storagePath={p.storage_path}
                    alt={p.name}
                    cover={!!p.storage_path}
                  />
                  <button
                    onClick={() =>
                      batch.selectMode
                        ? batch.toggle(p.id)
                        : navigate(`/products/profile/${p.id}`)
                    }
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
                  {!batch.selectMode && (
                    <>
                      <button
                        onClick={() => handleUnfavourite(p.id, p.name)}
                        className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                        aria-label="Remove from favourites"
                      >
                        <Heart className="size-5 fill-current text-destructive" />
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
                    </>
                  )}
                </div>

                {!batch.selectMode && isOpen && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60 space-y-3">
                    <ProductVoicenotes
                      productKey={p.product_key}
                      productName={p.name}
                      productBrand={p.brand ?? ""}
                    />
                    <Button
                      variant="goldOutline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleUnfavourite(p.id, p.name)}
                    >
                      <Heart className="size-3.5 mr-1 fill-current" /> Remove from favourites
                    </Button>
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>

      {batch.selectMode && (
        <BatchActionBar
          count={batch.count}
          totalVisible={filteredProducts.length}
          onSelectAll={() => batch.selectAll(filteredProducts.map((p) => p.id))}
          onClear={batch.clear}
          actions={[
            {
              key: "unfav",
              label: "Unfavourite",
              icon: <Heart className="size-4" />,
              onClick: handleBulkUnfavourite,
            },
            {
              key: "offshelf",
              label: "Off shelf",
              icon: <ArrowDownToLine className="size-4" />,
              onClick: handleBulkOffShelf,
            },
            {
              key: "delete",
              label: "Delete",
              icon: <Trash2 className="size-4" />,
              destructive: true,
              onClick: () => setConfirmDelete(true),
            },
          ]}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
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

export default Favourites;
