import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Flag } from "lucide-react";
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
  /** When true, save straight to the user's shelf and return to `returnTo`
   *  without showing the manual "Add to shelf" CTA. Used by the journal
   *  / wash-day product picker. */
  auto_save?: boolean;
  /** Where to navigate back to after auto_save completes. Defaults to /products. */
  returnTo?: string;
}

const ProductDetailNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as NavState | null) ?? null;
  const { upsert, allProducts } = useUserProducts("all");
  const { flags } = useIngredientLists();
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

  // Auto-save when the picker sheet sent us here. Refs aren't allowed
  // to short-circuit on early returns, so this hook lives above the
  // `if (!state)` guard.
  const autoSavedRef = useMemo(() => ({ done: false }), []);
  const autoSave = state?.auto_save ?? false;
  const autoSaveIntent = state?.intent ?? "shelf";
  const autoSaveReturnTo = state?.returnTo;
  useEffect(() => {
    if (!autoSave || autoSavedRef.done) return;
    const name = a.product_name;
    const key = state?.product_key;
    if (!name || !key) return;
    autoSavedRef.done = true;
    void (async () => {
      const ok = await upsert({
        product_key: key,
        name,
        brand: a.brand ?? null,
        category: a.category ?? null,
        image_url: state?.preview_url ?? null,
        storage_path: state?.storage_path ?? null,
        ingredients: a.ingredients ?? [],
        key_ingredients: a.key_ingredients ?? [],
        ai_summary: a.ai_summary ?? null,
        match_score: Math.max(0, Math.min(100, Math.round(a.match_score ?? 0))),
        on_shelf: autoSaveIntent === "shelf",
        on_wishlist: autoSaveIntent === "wishlist",
        added_to_shelf_at: autoSaveIntent === "shelf" ? new Date().toISOString() : null,
      });
      if (ok) {
        toast.success(autoSaveIntent === "shelf" ? "Added to your shelf" : "Added to wishlist");
        const fallback = autoSaveIntent === "shelf" ? "/products" : "/products/wishlist";
        navigate(autoSaveReturnTo ?? fallback, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, a.product_name, state?.product_key]);

  if (!state) return null;

  const aiFlagByName = new Map<string, IngredientFlag>();
  aiFlags.forEach((f) => aiFlagByName.set(f.name.toLowerCase().trim(), f));

  // Single unified "flagged" set — an ingredient that appears in 3+ of the
  // user's products. Educational only, no good/bad framing.
  const flaggedNames = new Set(flags.map(i => i.ingredient.toLowerCase()));

  const score = Math.max(0, Math.min(100, Math.round(a.match_score ?? 0)));

  // Find similar products on the user's shelf — must be in the same product
  // family as defined in *How To Love Your Afro* (e.g. shampoo ≈ cleanser,
  // curl cream ≈ twisting cream, leave-in conditioner ≈ leave-in spray,
  // deep conditioner ≈ hair mask ≈ rinse-out conditioner, pre-poo ≈ co-wash).
  // Within a family we then rank by shared ingredients to surface the closest match.
  const productFamily = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const c = raw.toLowerCase();
    // Cleansing
    if (/(shampoo|cleanser|clarifying|chelating)/.test(c) && !/(co-?wash|pre)/.test(c)) return "cleanse";
    // Pre-wash treatments (pre-poo, co-wash, hot oil treatment used before shampoo)
    if (/(pre-?poo|pre-?shampoo|co-?wash|hot oil)/.test(c)) return "pre-wash";
    // Deep treatments (deep conditioner, hair mask, protein treatment, rinse-out conditioner)
    if (/(deep condition|hair mask|protein treat|rinse|conditioner)(?!.*leave)/.test(c) && !/leave/.test(c)) return "deep-treat";
    // Leave-in moisturisers (leave-in conditioner, leave-in spray, moisturiser, milk, lotion)
    if (/(leave-?in|moisturis|milk|lotion|spray|refresher)/.test(c)) return "leave-in";
    // Stylers (curl cream, twisting cream, custard, gel, mousse, foam, edge control, butter)
    if (/(curl cream|twist|custard|gel|mousse|foam|edge|butter|pudding|definer|styler)/.test(c)) return "styler";
    // Sealants (oils, serums used to seal)
    if (/(oil|serum|sealant)/.test(c)) return "sealant";
    // Scalp care
    if (/(scalp|tonic|growth)/.test(c)) return "scalp";
    return null;
  };

  const myFamily = productFamily(a.category);
  const ingredientSet = new Set(ingredients.map(i => i.toLowerCase()));
  const similar = myFamily
    ? allProducts
        .filter(p => p.on_shelf && p.product_key !== state.product_key && productFamily(p.category) === myFamily)
        .map(p => ({
          p,
          shared: p.ingredients.filter(i => ingredientSet.has(i.toLowerCase())).length,
        }))
        .sort((a, b) => b.shared - a.shared)
        .slice(0, 3)
        .map(x => x.p)
    : [];

  const save = async (target: "shelf" | "wishlist") => {
    if (!a.product_name) {
      toast.error("Missing product name");
      return;
    }
    setSaving(true);
    // Merge the per-ingredient AI flags (good/warn/bad + body) into
    // key_ingredients so that everything personalised at scan/upload time is
    // saved with the product. ProductProfile will rehydrate from this and
    // never re-call the AI on future visits — the cache is only invalidated
    // when the user's hair/health profile changes (Phase 2.5 trigger).
    const flagToneToSeverity = (t: "good" | "warn" | "bad"): "good" | "warn" | "avoid" =>
      t === "bad" ? "avoid" : t;
    const existingByName = new Map(
      (a.key_ingredients ?? []).map((k) => [k.name.toLowerCase().trim(), k]),
    );
    const aiFlagsByName = new Map(aiFlags.map((f) => [f.name.toLowerCase().trim(), f]));
    const mergedNames = new Set([
      ...existingByName.keys(),
      ...aiFlagsByName.keys(),
    ]);
    const mergedKeyIngredients: KeyIngredient[] = Array.from(mergedNames).map((lname) => {
      const base = existingByName.get(lname);
      const flag = aiFlagsByName.get(lname);
      return {
        name: base?.name ?? flag?.name ?? lname,
        benefit: flag?.body ?? base?.benefit,
        flag: flag ? flagToneToSeverity(flag.tone) : base?.flag,
      };
    });
    const ok = await upsert({
      product_key: state.product_key,
      name: a.product_name,
      brand: a.brand ?? null,
      category: a.category ?? null,
      image_url: state.preview_url,
      storage_path: state.storage_path,
      ingredients: ingredients,
      key_ingredients: mergedKeyIngredients,
      ai_summary: a.ai_summary ?? null,
      match_score: score,
      on_shelf: target === "shelf",
      on_wishlist: target === "wishlist",
      added_to_shelf_at: target === "shelf" ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (ok) {
      toast.success(target === "shelf" ? "Added to shelf" : "Added to wishlist");
      const fallback = target === "shelf" ? "/products" : "/products/wishlist";
      navigate(state.returnTo ?? fallback);
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
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Ingredients ({ingredients.length})
              </p>
              {aiLoading && (
                <p className="text-[10px] text-muted-foreground italic">Analysing…</p>
              )}
            </div>

            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {ingredients.map((name, i) => {
                const lower = name.toLowerCase().trim();
                const aiFlag = aiFlagByName.get(lower);
                // The flag is now a single unified marker — gold flag if the
                // ingredient appears in 3+ of the user's products. Purely
                // educational, no good/bad bias.
                const isFlagged = flaggedNames.has(lower);
                return (
                  <div key={i} className="p-3 flex items-start gap-2.5">
                    <span
                      className="shrink-0 mt-0.5 w-4 flex items-center justify-center"
                      aria-label={isFlagged ? "flagged ingredient" : "ingredient"}
                    >
                      {isFlagged ? (
                        <Flag
                          className="size-3.5 fill-current"
                          style={{ color: "hsl(40 65% 32%)" }}
                          aria-label="flagged ingredient"
                        />
                      ) : null}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{name}</p>
                      {aiFlag?.body && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {aiFlag.body}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </SurfaceCard>
            {aiError && (
              <p className="text-[11px] text-destructive mt-2 px-1">{aiError}</p>
            )}
          </div>
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
