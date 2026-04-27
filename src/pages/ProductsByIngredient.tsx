// "Used in N other products" landing — opened from an ingredient row on the
// product page when more than one of the user's other products contains
// that ingredient. Lets the user pick which sibling product to open.
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { useUserProducts } from "@/hooks/useUserProducts";
import { cn } from "@/lib/utils";

const statusLabel = (p: { on_shelf: boolean; on_wishlist: boolean; previously_on_shelf: boolean }) => {
  if (p.on_shelf) return { label: "On shelf", tone: "text-good" };
  if (p.on_wishlist) return { label: "Wishlist", tone: "text-primary" };
  if (p.previously_on_shelf) return { label: "Off shelf", tone: "text-muted-foreground" };
  return { label: "Saved", tone: "text-muted-foreground" };
};

const ProductsByIngredient = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ingredient = params.get("ingredient") ?? "";
  const excludeKey = params.get("excludeKey") ?? "";
  const { allProducts, loading } = useUserProducts("all");

  const products = useMemo(() => {
    const target = ingredient.toLowerCase().trim();
    return allProducts
      .filter((p) => p.product_key !== excludeKey)
      .filter((p) =>
        (p.ingredients ?? []).some((i) => i.toLowerCase().trim() === target),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts, ingredient, excludeKey]);

  return (
    <ScreenLayout>
      <TitleBar title="Other products" />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          Your products that contain{" "}
          <span className="font-medium text-foreground">{ingredient}</span>.
        </p>

        {loading ? (
          <SurfaceCard>
            <LoadingDot label="Loading…" />
          </SurfaceCard>
        ) : products.length === 0 ? (
          <EmptyState
            icon="🧴"
            message="No other products"
            hint={`None of your other products list ${ingredient}.`}
          />
        ) : (
          products.map((p) => {
            const s = statusLabel(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/products/profile/${p.id}`)}
                className="w-full text-left"
              >
                <SurfaceCard className="!py-3">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-[10px] bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="size-full object-contain" loading="lazy" />
                      ) : (
                        <span className="text-2xl" aria-hidden>🧴</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                      {p.brand && (
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5 truncate">
                          {p.brand}
                        </p>
                      )}
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-[0.14em] font-semibold",
                          s.tone,
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                  </div>
                </SurfaceCard>
              </button>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProductsByIngredient;
