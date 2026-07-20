import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FlaskConical, Leaf, PackageSearch, Sparkles } from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import BrandLink from "@/components/BrandLink";
import ProductThumb from "@/components/ProductThumb";
import { useIngredientProfile } from "@/hooks/useIngredientProfile";
import { useUserProducts } from "@/hooks/useUserProducts";

const SectionHeader = ({ icon: Icon, label }: { icon: typeof FlaskConical; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="size-4" />
    </span>
    <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-primary">
      {label}
    </p>
  </div>
);

const IngredientResearch = () => {
  const [params] = useSearchParams();
  const ingredient = (params.get("ingredient") ?? "").trim();
  const { allProducts, loading: productsLoading } = useUserProducts("all");

  const relatedProducts = useMemo(() => {
    const target = ingredient.toLowerCase();
    if (!target) return [];
    return allProducts.filter((p) => {
      const names = [
        ...(p.ingredients ?? []),
        ...(p.key_ingredients ?? []).map((i) => i.name),
      ];
      return names.some((name) => name.toLowerCase().trim() === target);
    });
  }, [allProducts, ingredient]);

  const profile = useIngredientProfile(
    ingredient || null,
    "The user tapped this ingredient from a wash-day tip for further research.",
    Boolean(ingredient),
    {
      formulationIngredients: Array.from(
        new Set(relatedProducts.flatMap((p) => p.ingredients ?? [])),
      ).filter((name) => name.toLowerCase() !== ingredient.toLowerCase()).slice(0, 30),
    },
  );

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Ingredient research" />
      <div className="px-5 pb-8 space-y-4">
        {!ingredient ? (
          <EmptyState icon="🔎" message="No ingredient selected" hint="Open an ingredient link from a tip or product page." />
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">
                Ingredient
              </p>
              <h1 className="font-display text-2xl leading-tight text-foreground break-words">
                {ingredient}
              </h1>
            </div>

            {profile.isLoading ? (
              <SurfaceCard>
                <LoadingDot label="Loading ingredient profile…" fullScreen={false} />
              </SurfaceCard>
            ) : profile.error ? (
              <SurfaceCard tone="orange" className="space-y-2">
                <SectionHeader icon={FlaskConical} label="Research note" />
                <p className="text-sm leading-relaxed text-foreground/80">
                  This ingredient is saved in your product data, but its AI profile could not load right now.
                </p>
              </SurfaceCard>
            ) : profile.data ? (
              <div className="space-y-3">
                <SurfaceCard className="space-y-3">
                  <SectionHeader icon={FlaskConical} label="What it is" />
                  <p className="text-sm leading-relaxed text-foreground/85">
                    {profile.data.what_it_is}
                  </p>
                </SurfaceCard>

                {profile.data.what_it_means_for_you && (
                  <SurfaceCard tone="gold" className="space-y-3">
                    <SectionHeader icon={Sparkles} label="What it means for you" />
                    <p className="text-sm leading-relaxed text-foreground/85">
                      {profile.data.what_it_means_for_you}
                    </p>
                  </SurfaceCard>
                )}

                {profile.data.benefits?.length > 0 && (
                  <SurfaceCard className="space-y-3">
                    <SectionHeader icon={Leaf} label="In a formula" />
                    <div className="space-y-2">
                      {profile.data.benefits.map((benefit, index) => (
                        <p key={index} className="text-sm leading-relaxed text-foreground/85 flex gap-2">
                          <span className="text-primary shrink-0">•</span>
                          <span>{benefit}</span>
                        </p>
                      ))}
                    </div>
                  </SurfaceCard>
                )}
              </div>
            ) : null}

            <SurfaceCard className="space-y-3">
              <SectionHeader icon={PackageSearch} label="Products containing this" />
              {productsLoading ? (
                <LoadingDot label="Checking your products…" fullScreen={false} />
              ) : relatedProducts.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No saved products currently list this ingredient.
                </p>
              ) : (
                <div className="space-y-2">
                  {relatedProducts.map((product) => (
                    <Link
                      key={product.id}
                      to={`/products/profile/${product.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-2 active:scale-[0.99] transition"
                    >
                      <ProductThumb
                        imageUrl={product.image_url}
                        storagePath={product.storage_path}
                        alt={product.name}
                        cover={!!product.storage_path}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-foreground break-words">
                          {product.name}
                        </span>
                        {product.brand && (
                          <span className="block text-[11px] text-muted-foreground mt-1">
                            <BrandLink brand={product.brand} />
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default IngredientResearch;