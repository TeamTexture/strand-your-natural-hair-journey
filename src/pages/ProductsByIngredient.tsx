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
import ListRow from "@/components/nav/ListRow";
import MatchStars from "@/components/MatchStars";
import ProductThumb from "@/components/ProductThumb";
import { useUserProducts } from "@/hooks/useUserProducts";
import BrandLink from "@/components/BrandLink";
import LevelGate from "@/components/tips/LevelGate";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import type { GuidanceTone } from "@/lib/guidance";

const statusLabel = (p: { on_shelf: boolean; on_wishlist: boolean; previously_on_shelf: boolean }): { label: string; tone: GuidanceTone } => {
  if (p.on_shelf) return { label: "On shelf", tone: "good" };
  if (p.on_wishlist) return { label: "Wishlist", tone: "gold" };
  if (p.previously_on_shelf) return { label: "Off shelf", tone: "muted" };
  return { label: "Saved", tone: "muted" };
};

const ProductsByIngredient = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ingredient = params.get("ingredient") ?? "";
  const excludeKey = params.get("excludeKey") ?? "";
  const { allProducts, loading } = useUserProducts("all");
  const { level } = useTipsLevel();

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
    <ScreenLayout bottomNav>
      <TitleBar title="Other products" />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          <LevelGate min={2} fallback={<span className="font-medium text-foreground">{ingredient}</span>}>
            Your products that contain{" "}
            <span className="font-medium text-foreground">{ingredient}</span>.
          </LevelGate>
        </p>

        {loading ? (
          <SurfaceCard>
            <LoadingDot label="Loading…" />
          </SurfaceCard>
        ) : products.length === 0 ? (
          <EmptyState
            icon="🧴"
            message="No other products"
            hint={level >= 2 ? `None of your other products list ${ingredient}.` : "No matches."}
          />
        ) : (
          products.map((p) => {
            const s = statusLabel(p);
            return (
              <ListRow
                key={p.id}
                to={`/products/profile/${p.id}`}
                leading={
                  <ProductThumb
                    imageUrl={p.image_url}
                    alt={p.name}
                    brand={p.brand}
                    name={p.name}
                  />
                }
                name={p.name}
                secondary={
                  <span className="inline-flex items-center gap-2">
                    {p.brand && <BrandLink brand={p.brand} />}
                    <MatchStars item={p} />
                  </span>
                }
                fact={s.label}
                factTone={s.tone}
              />
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProductsByIngredient;
