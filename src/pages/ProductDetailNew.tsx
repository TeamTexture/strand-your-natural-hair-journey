import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useUserProducts, KeyIngredient } from "@/hooks/useUserProducts";
import { useIngredientLists } from "@/hooks/useIngredientLists";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Analysis {
  product_name?: string;
  brand?: string;
  category?: string;
  ingredients?: string[];
  key_ingredients?: KeyIngredient[];
  match_score?: number;
  ai_summary?: string;
}

interface NavState {
  analysis: Analysis;
  storage_path: string;
  preview_url: string;
  product_key: string;
  intent?: "shelf" | "wishlist";
}

const ProductDetailNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as NavState | null) ?? null;
  const { upsert, allProducts } = useUserProducts("all");
  const { avoid, favourites } = useIngredientLists();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) navigate("/products", { replace: true });
  }, [state, navigate]);

  if (!state) return null;
  const a = state.analysis ?? {};
  const ingredients = a.ingredients ?? [];

  const avoidNames = new Set(avoid.map(i => i.ingredient.toLowerCase()));
  const favNames = new Set(favourites.map(i => i.ingredient.toLowerCase()));

  const redFlags = ingredients.filter(i => avoidNames.has(i.toLowerCase()));
  const greenLights = ingredients.filter(i => favNames.has(i.toLowerCase()));

  const score = Math.max(0, Math.min(100, Math.round(a.match_score ?? 0)));

  // Find similar products on the user's shelf (share at least one key ingredient)
  const ingredientSet = new Set(ingredients.map(i => i.toLowerCase()));
  const similar = allProducts.filter(
    p => p.on_shelf && p.ingredients.some(i => ingredientSet.has(i.toLowerCase())),
  ).slice(0, 3);

  const save = async (target: "shelf" | "wishlist") => {
    if (!a.product_name) {
      toast.error("Missing product name");
      return;
    }
    setSaving(true);
    const ok = await upsert({
      product_key: state.product_key,
      name: a.product_name,
      brand: a.brand ?? null,
      category: a.category ?? null,
      image_url: state.preview_url,
      storage_path: state.storage_path,
      ingredients: ingredients,
      key_ingredients: a.key_ingredients ?? [],
      ai_summary: a.ai_summary ?? null,
      match_score: score,
      on_shelf: target === "shelf",
      on_wishlist: target === "wishlist",
      added_to_shelf_at: target === "shelf" ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (ok) {
      toast.success(target === "shelf" ? "Added to shelf" : "Added to wishlist");
      navigate(target === "shelf" ? "/products" : "/products/wishlist");
    }
  };

  return (
    <ScreenLayout bottomNav={false}>
      <TitleBar title="Product Analysis" back />
      <div className="px-5 pb-8 space-y-4">
        <img
          src={state.preview_url}
          alt={a.product_name ?? "Product"}
          className="w-full aspect-square object-cover rounded-[18px] border border-border"
        />

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold leading-tight">{a.product_name ?? "Unknown product"}</h1>
            <p className="text-sm text-muted-foreground">{a.brand ?? ""}</p>
            {a.category && <p className="text-[11px] uppercase tracking-[0.15em] text-primary mt-1">{a.category}</p>}
          </div>
          <div className="size-16 rounded-full border-[3px] border-primary text-primary flex items-center justify-center text-base font-bold shrink-0">
            {score}
          </div>
        </div>

        {redFlags.length > 0 && (
          <SurfaceCard className="border-2 border-destructive/60 bg-destructive/5">
            <p className="text-xs font-semibold text-destructive mb-1">⚠ Red flag</p>
            <p className="text-xs text-foreground/80 leading-snug">
              Contains <strong>{redFlags.join(", ")}</strong> — on your avoid list based on your hair history.
            </p>
          </SurfaceCard>
        )}

        {greenLights.length > 0 && (
          <SurfaceCard className="border-2 border-good/60 bg-good/5">
            <p className="text-xs font-semibold text-good mb-1">✓ Green light</p>
            <p className="text-xs text-foreground/80 leading-snug">
              Contains <strong>{greenLights.join(", ")}</strong> — has worked well for your hair.
            </p>
          </SurfaceCard>
        )}

        {a.ai_summary && (
          <SurfaceCard tone="gold">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">AI Summary</p>
            <p className="text-sm leading-snug">{a.ai_summary}</p>
          </SurfaceCard>
        )}

        {(a.key_ingredients?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Key Ingredients</p>
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {a.key_ingredients!.map((k, i) => {
                const tone = k.flag === "good" ? "bg-good" : k.flag === "warn" ? "bg-warn" : k.flag === "avoid" ? "bg-destructive" : "bg-muted";
                return (
                  <div key={i} className="p-3 flex items-start gap-3">
                    <span className={cn("size-2.5 rounded-full mt-1.5 shrink-0", tone)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{k.name}</p>
                      {k.benefit && <p className="text-[11px] text-muted-foreground mt-0.5">{k.benefit}</p>}
                    </div>
                  </div>
                );
              })}
            </SurfaceCard>
          </div>
        )}

        {similar.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Similar products on your shelf</p>
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {similar.map(p => (
                <div key={p.id} className="p-3 flex items-center gap-3">
                  <div className="size-10 rounded-[8px] bg-primary/15 flex items-center justify-center text-lg">🧴</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                  </div>
                </div>
              ))}
            </SurfaceCard>
          </div>
        )}

        {ingredients.length > 0 && (
          <details className="bg-card border border-border rounded-[14px] p-3.5">
            <summary className="text-sm font-medium cursor-pointer">Full ingredient list ({ingredients.length})</summary>
            <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{ingredients.join(", ")}</p>
          </details>
        )}

        <div className="space-y-2 pt-2">
          <Button variant="gold" size="pill" onClick={() => save("shelf")} disabled={saving}>
            Add to Shelf
          </Button>
          <Button variant="goldOutline" size="pill" onClick={() => save("wishlist")} disabled={saving}>
            Add to Wishlist
          </Button>
          <Button variant="ghost" size="pill" onClick={() => navigate("/products")} disabled={saving}>
            Dismiss
          </Button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProductDetailNew;
