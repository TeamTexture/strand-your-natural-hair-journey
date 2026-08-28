import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FlaskConical, Leaf, PackageSearch, Sparkles, type LucideIcon } from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import BrandLink from "@/components/BrandLink";
import ProductThumb from "@/components/ProductThumb";
import { useIngredientProfile } from "@/hooks/useIngredientProfile";
import { useUserProducts } from "@/hooks/useUserProducts";
import AiProse from "@/components/tips/AiProse";
import LevelGate from "@/components/tips/LevelGate";

const SectionHeader = ({ icon: Icon, label }: { icon: LucideIcon; label: string }) => (
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
    const normalise = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const target = normalise(ingredient);
    if (!target) return [];
    // Build a tolerant token set: exact normalised form + a compact no-space form
    const targetCompact = target.replace(/\s+/g, "");
    return allProducts.filter((p) => {
      const names = [
        ...(p.ingredients ?? []),
        ...(p.key_ingredients ?? []).map((i) => i.name),
      ];
      return names.some((rawName) => {
        const name = normalise(rawName);
        if (!name) return false;
        if (name === target) return true;
        const nameCompact = name.replace(/\s+/g, "");
        if (nameCompact === targetCompact) return true;
        // Word-boundary style containment so "Sodium PCA" matches
        // "Sodium PCA (Amino Acid)" or "Aqua, Sodium PCA, Glycerin"
        const pattern = new RegExp(`(?:^|\\s)${target.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\s|$)`);
        return pattern.test(name);
      });
    });
  }, [allProducts, ingredient]);

  // Single authoritative path: the ingredient explainer (shared glossary for
  // "what it is" + the sensitivity-aware fit). The old `ingredient-profile`
  // generator is retired so this page can never contradict a product score.
  const { explainer, isLoading: explainerLoading, error: explainerError } =
    useIngredientExplainer(ingredient || null);

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
                {explainer?.glossary?.display_name || ingredient}
              </h1>
            </div>

            {explainerLoading ? (
              <SurfaceCard>
                <LoadingDot label="Loading ingredient profile…" fullScreen={false} />
              </SurfaceCard>
            ) : explainerError ? (
              <SurfaceCard tone="orange" className="space-y-2">
                <SectionHeader icon={FlaskConical} label="Research note" />
                <p className="text-sm leading-relaxed text-foreground/80">
                  This ingredient is saved in your product data, but its profile could not load right now.
                </p>
              </SurfaceCard>
            ) : explainer ? (
              <div className="space-y-3">
                {explainer.glossary?.what_it_is?.trim() && (
                  <SurfaceCard className="space-y-3">
                    <SectionHeader icon={FlaskConical} label="What it is" />
                    <AiProse text={explainer.glossary.what_it_is} />
                  </SurfaceCard>
                )}

                {explainer.fit?.for_you && (
                  <SurfaceCard tone="gold" className="space-y-3">
                    <SectionHeader icon={Sparkles} label="What it means for you" />
                    <AiProse text={explainer.fit.for_you} />
                    {explainer.fit.usage_tip && (
                      <p className="text-sm leading-relaxed text-foreground/80 flex gap-2">
                        <Leaf className="mt-[3px] size-3.5 shrink-0 text-primary" aria-hidden />
                        <span>{explainer.fit.usage_tip}</span>
                      </p>
                    )}
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