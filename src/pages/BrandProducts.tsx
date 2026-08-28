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
import ProductThumb from "@/components/ProductThumb";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useUserTools } from "@/hooks/useUserTools";
import { cn } from "@/lib/utils";
import MatchStars from "@/components/MatchStars";
import { starsForItem } from "@/lib/matchStars";
import SectionLabel from "@/components/SectionLabel";
import { Wrench } from "lucide-react";

const statusLabel = (p: { on_shelf: boolean; on_wishlist: boolean; previously_on_shelf: boolean }) => {
  if (p.on_shelf) return { label: "On shelf", tone: "text-good" };
  if (p.on_wishlist) return { label: "Wishlist", tone: "text-primary" };
  if (p.previously_on_shelf) return { label: "Off shelf", tone: "text-muted-foreground" };
  return { label: "Saved", tone: "text-muted-foreground" };
};

const BrandProducts = () => {
  const navigate = useNavigate();
  const { brand } = useParams<{ brand: string }>();
  const decodedBrand = decodeURIComponent(brand ?? "");
  const { allProducts, loading } = useUserProducts("all");
  const { tools: allTools, loading: toolsLoading } = useUserTools();

  const products = useMemo(() => {
    return allProducts
      .filter(
        (p) =>
          (p.brand ?? "").trim().toLowerCase() === decodedBrand.trim().toLowerCase(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts, decodedBrand]);

  // Tools carry the same brand field, so the brand page lists everything the
  // member has saved from that brand — products AND tools.
  const tools = useMemo(() => {
    return allTools
      .filter(
        (t) => (t.brand ?? "").trim().toLowerCase() === decodedBrand.trim().toLowerCase(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTools, decodedBrand]);

  return (
    <ScreenLayout bottomNav>
      <TitleBar title={decodedBrand || "Brand"} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          {products.length} product{products.length === 1 ? "" : "s"}
          {tools.length > 0 && ` and ${tools.length} tool${tools.length === 1 ? "" : "s"}`} from{" "}
          {decodedBrand} in your account.
        </p>

        {loading ? (
          <SurfaceCard>
            <LoadingDot label="Loading…" />
          </SurfaceCard>
        ) : products.length === 0 && tools.length === 0 ? (
          <EmptyState
            icon="🧴"
            message="Nothing from this brand yet"
            hint={`You haven't saved any other ${decodedBrand} products or tools yet. Add them from the scanner or product URL.`}
          />
        ) : (
          products.map((p) => {
            const s = statusLabel(p);
            const hasStars = starsForItem(p) != null;
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
                  <div className="flex items-start gap-3">
                    <ProductThumb
                      imageUrl={p.image_url}
                      storagePath={p.storage_path}
                      alt={p.name}
                      cover={!!p.storage_path}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="product-title text-[13px] leading-snug">

                        {p.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-[0.14em] font-semibold",
                            s.tone,
                          )}
                        >
                          {s.label}
                        </span>
                        {hasStars && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <MatchStars item={p} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </SurfaceCard>
              </button>
            );
          })
        )}

        {!toolsLoading && tools.length > 0 && (
          <div className="pt-2 space-y-3">
            <SectionLabel className="px-0">Tools from {decodedBrand}</SectionLabel>
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate("/products")}
                className="w-full text-left"
              >
                <SurfaceCard className="!py-3">
                  <div className="flex items-start gap-3">
                    <div className="size-12 rounded-[10px] overflow-hidden bg-secondary shrink-0">
                      {t.image_url ? (
                        <img src={t.image_url} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="size-full flex items-center justify-center bg-primary/15 text-primary">
                          <Wrench className="size-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug break-words">{t.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
                          {t.on_wishlist ? "Wishlist" : "Tool"}
                        </span>
                        {starsForItem(t) != null && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <MatchStars item={t} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </SurfaceCard>
              </button>
            ))}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandProducts;
