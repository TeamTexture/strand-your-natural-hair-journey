import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useUserProducts, KeyIngredient } from "@/hooks/useUserProducts";
import { useIngredientLists } from "@/hooks/useIngredientLists";
import { useGoals } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface IngredientFlag {
  name: string;
  tone: "good" | "warn" | "bad";
  body: string;
}

interface Analysis {
  product_name?: string;
  brand?: string;
  category?: string;
  ingredients?: string[];
  key_ingredients?: KeyIngredient[];
  match_score?: number;
  ai_summary?: string;
  usage_instructions?: string;
  use_cases?: string[];
  tips?: string[];
}

interface NavState {
  analysis: Analysis;
  storage_path: string | null;
  preview_url: string | null;
  product_key: string;
  intent?: "shelf" | "wishlist";
  source_url?: string;
}

const ProductDetailNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as NavState | null) ?? null;
  const { upsert, allProducts } = useUserProducts("all");
  const { avoid, favourites } = useIngredientLists();
  const { goals } = useGoals();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [aiFlags, setAiFlags] = useState<IngredientFlag[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) navigate("/products", { replace: true });
  }, [state, navigate]);

  const a = state?.analysis ?? {};
  const ingredients = a.ingredients ?? [];
  const productKey = state?.product_key ?? "";
  const ingredientsKey = ingredients.join("|");

  // Fetch personalised per-ingredient flags as soon as the analysis lands.
  useEffect(() => {
    if (!user || !productKey || ingredients.length === 0) return;
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      setAiError(null);
      try {
        const context = await buildAiContext();
        const styleLocal = (() => {
          try { return JSON.parse(localStorage.getItem("strand_current_style") || "null"); }
          catch { return null; }
        })();
        const challenges = goals
          .map((g) => g.challenge)
          .filter((c): c is string => Boolean(c && c.trim()));
        const { data, error } = await supabase.functions.invoke("ingredient-analysis", {
          body: {
            productKey,
            productName: a.product_name ?? "Unknown",
            productBrand: a.brand ?? "",
            ingredients,
            hairProfile: context.hairProfile ?? {},
            healthProfile: context.healthProfile ?? {},
            heritage: [],
            goals: goals.map((g) => ({
              kind: g.kind, title: g.title, target_text: g.target_text,
              target_value: g.target_value, unit: g.unit, current_value: g.current_value,
              target_date: g.target_date, challenge: g.challenge, status: g.status,
            })),
            currentStyle: styleLocal,
            challenges,
            context,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setAiFlags((data?.analysis?.ingredients ?? []) as IngredientFlag[]);
      } catch (e) {
        if (cancelled) return;
        setAiError(e instanceof Error ? e.message : "Could not analyse ingredients");
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, productKey, ingredientsKey]);

  if (!state) return null;

  const aiFlagByName = new Map<string, IngredientFlag>();
  aiFlags.forEach((f) => aiFlagByName.set(f.name.toLowerCase().trim(), f));

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
        {state.preview_url ? (
          <img
            src={state.preview_url}
            alt={a.product_name ?? "Product"}
            className="w-full aspect-square object-cover rounded-[18px] border border-border"
          />
        ) : (
          <div className="w-full aspect-square rounded-[18px] border border-border bg-primary/10 flex items-center justify-center text-6xl">
            🧴
          </div>
        )}

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

        {a.ai_summary && (
          <SurfaceCard tone="gold">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Summary</p>
            <p className="text-sm leading-snug">{a.ai_summary}</p>
          </SurfaceCard>
        )}

        {(a.key_ingredients?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Key Ingredients</p>
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {a.key_ingredients!.map((k, i) => (
                <div key={i} className="p-3">
                  <p className="text-sm font-medium leading-tight">{k.name}</p>
                  {k.benefit && <p className="text-[11px] text-muted-foreground mt-0.5">{k.benefit}</p>}
                </div>
              ))}
            </SurfaceCard>
          </div>
        )}

        {a.usage_instructions && a.usage_instructions.trim().length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">
              Manufacturer directions
            </p>
            <SurfaceCard>
              <p className="text-xs leading-relaxed text-foreground/85 whitespace-pre-line">
                {a.usage_instructions}
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-2">
                Source: brand label
              </p>
            </SurfaceCard>
          </div>
        )}

        {(a.use_cases?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">
              Why it could work for you
            </p>
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {a.use_cases!.map((u, i) => (
                <div key={i} className="p-3 flex items-start gap-2">
                  <span className="text-primary text-xs mt-0.5">•</span>
                  <p className="text-xs leading-snug flex-1">{u}</p>
                </div>
              ))}
            </SurfaceCard>
          </div>
        )}

        {(a.tips?.length ?? 0) > 0 && (
          <SurfaceCard tone="gold">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-2">Tips for you</p>
            <ul className="space-y-1.5">
              {a.tips!.map((t, i) => (
                <li key={i} className="text-xs leading-snug">— {t}</li>
              ))}
            </ul>
          </SurfaceCard>
        )}

        {similar.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Similar products on your shelf</p>
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {similar.map(p => (
                <div key={p.id} className="p-3 flex items-center gap-3">
                  <div className="size-10 rounded-[8px] overflow-hidden bg-secondary shrink-0">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="size-full flex items-center justify-center text-lg bg-primary/15">🧴</div>
                    )}
                  </div>
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
