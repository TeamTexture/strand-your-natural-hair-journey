// Brand-products listing — opened when the user taps the brand name on a
// product page. Shows every product from this brand that exists in the
// user's account, with the shelf status (Shelf / Wishlist / Off the shelf)
// and the saved star rating clearly visible. Tapping a row routes to the
// unified product page (IngredientDetail).
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

const Stars = ({ value }: { value: number | null }) => {
  if (!value) {
    return <span className="text-[11px] text-muted-foreground">No rating</span>;
  }
  return (
    <span className="text-base leading-none" aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "text-primary" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
};

const BrandProducts = () => {
  const navigate = useNavigate();
  const { brand } = useParams<{ brand: string }>();
  const decodedBrand = decodeURIComponent(brand ?? "");
  const { allProducts, loading } = useUserProducts("all");

  const products = useMemo(() => {
    return allProducts
      .filter(
        (p) =>
          (p.brand ?? "").trim().toLowerCase() === decodedBrand.trim().toLowerCase(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts, decodedBrand]);

  return (
    <ScreenLayout>
      <TitleBar title={decodedBrand || "Brand"} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          {products.length} product{products.length === 1 ? "" : "s"} from {decodedBrand} in your account.
        </p>

        {loading ? (
          <SurfaceCard>
            <LoadingDot label="Loading…" />
          </SurfaceCard>
        ) : products.length === 0 ? (
          <EmptyState
            emoji="🧴"
            title="Nothing from this brand yet"
            body={`You haven't saved any other ${decodedBrand} products yet. Add them from the scanner or product URL.`}
          />
        ) : (
          products.map((p) => {
            const s = statusLabel(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  navigate(
                    `/products/ingredient?key=${encodeURIComponent(p.product_key)}&name=${encodeURIComponent(p.name)}&brand=${encodeURIComponent(p.brand ?? "")}`,
                  )
                }
                className="w-full text-left"
              >
                <SurfaceCard className="!py-3">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-[10px] bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          className="size-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-2xl" aria-hidden>
                          🧴
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">
                        {p.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-[0.14em] font-semibold",
                            s.tone,
                          )}
                        >
                          {s.label}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <Stars value={p.rating} />
                      </div>
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

export default BrandProducts;
