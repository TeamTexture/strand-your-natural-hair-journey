import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useIngredientLists } from "@/hooks/useIngredientLists";
import { useGoals } from "@/hooks/useGoals";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildAiContext } from "@/lib/aiContext";

/** Per-ingredient flag returned by the ingredient-analysis edge function. */
interface IngredientFlag {
  name: string;
  tone: "good" | "warn" | "bad";
  body: string;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const StarPicker = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div className="flex gap-1.5">
    {[1, 2, 3, 4, 5].map(n => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(n)}
        aria-label={`Rate ${n} stars`}
        className="text-2xl leading-none p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <span className={n <= value ? "text-primary" : "text-border"}>★</span>
      </button>
    ))}
  </div>
);

const ProductProfile = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { allProducts, loading, setShelf, setWishlist, remove, reload } = useUserProducts("all");
  const { washDays } = useWashDays();
  const { avoid, favourites } = useIngredientLists();
  const { goals } = useGoals();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingRating, setSavingRating] = useState(false);

  // Per-ingredient AI flags (good/warn/bad + body) for THIS product, scored
  // against the user's full profile (hair, health, goals, current style).
  const [aiFlags, setAiFlags] = useState<IngredientFlag[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiMatchScore, setAiMatchScore] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const product = useMemo(() => allProducts.find(p => p.id === id) ?? null, [allProducts, id]);

  const avoidNames = useMemo(() => new Set(avoid.map(i => i.ingredient.toLowerCase())), [avoid]);
  const favNames = useMemo(() => new Set(favourites.map(i => i.ingredient.toLowerCase())), [favourites]);

  // Map of lower-cased ingredient name -> AI flag, for O(1) lookup in the list.
  const aiFlagByName = useMemo(() => {
    const map = new Map<string, IngredientFlag>();
    aiFlags.forEach((f) => map.set(f.name.toLowerCase().trim(), f));
    return map;
  }, [aiFlags]);

  const appearances = useMemo(() => {
    if (!product) return [] as Array<{ id: string; date: string; stepName?: string }>;
    return washDays
      .filter(wd => wd.product_ids?.includes(product.id))
      .map(wd => {
        const step = (wd.steps ?? []).find(s => s.product_id === product.id);
        return { id: wd.id, date: wd.wash_date, stepName: step?.name };
      });
  }, [washDays, product]);

  const lastUse = appearances[0] ?? null;

  // Fetch personalised per-ingredient flags from the ingredient-analysis edge
  // function. Cached server-side in ai_summaries (per user, per product), so
  // repeat visits are instant. We pass the user's full profile (hair, health,
  // goals, current style, challenges) so flags reflect THIS user's context.
  useEffect(() => {
    if (!product || !user) return;
    if (!product.ingredients || product.ingredients.length === 0) return;
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
            productKey: product.product_key,
            productName: product.name,
            productBrand: product.brand,
            ingredients: product.ingredients,
            hairProfile: context.hairProfile ?? {},
            healthProfile: context.healthProfile ?? {},
            heritage: [],
            goals: goals.map((g) => ({
              kind: g.kind,
              title: g.title,
              target_text: g.target_text,
              target_value: g.target_value,
              unit: g.unit,
              current_value: g.current_value,
              target_date: g.target_date,
              challenge: g.challenge,
              status: g.status,
            })),
            currentStyle: styleLocal,
            challenges,
            context,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const flags = (data?.analysis?.ingredients ?? []) as IngredientFlag[];
        setAiFlags(flags);
        const summary = typeof data?.analysis?.summary === "string" ? data.analysis.summary : null;
        setAiSummary(summary);
        const score = typeof data?.analysis?.match_score === "number" ? data.analysis.match_score : null;
        setAiMatchScore(score);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not analyse ingredients";
        setAiError(msg);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, user?.id, (product?.ingredients ?? []).join("|")]);

  if (loading) {
    return (
      <ScreenLayout bottomNav={false}>
        <TitleBar title="Product" back />
        <div className="px-5"><LoadingDot label="Loading product…" /></div>
      </ScreenLayout>
    );
  }

  if (!product) {
    return (
      <ScreenLayout bottomNav={false}>
        <TitleBar title="Product" back />
        <div className="px-5">
          <EmptyState message="Product not found" hint="It may have been removed." />
        </div>
      </ScreenLayout>
    );
  }

  const ingredients = product.ingredients ?? [];
  const redFlags = ingredients.filter(i => avoidNames.has(i.toLowerCase()));
  const greenLights = ingredients.filter(i => favNames.has(i.toLowerCase()));
  const score = product.match_score ?? 0;

  const updateRating = async (n: number) => {
    if (!user) return;
    setSavingRating(true);
    const { error } = await supabase
      .from("user_products")
      .update({ rating: n })
      .eq("id", product.id);
    if (error) {
      toast.error("Could not save rating");
    } else {
      // Mirror to product_ratings so ingredient list logic continues to work
      await supabase
        .from("product_ratings")
        .upsert({
          user_id: user.id,
          product_key: product.product_key,
          product_name: product.name,
          product_brand: product.brand,
          ingredients: product.ingredients,
          rating: n,
        }, { onConflict: "user_id,product_key" });
      toast.success("Rating saved");
      await reload();
    }
    setSavingRating(false);
  };

  const handleDelete = async () => {
    await remove(product.id);
    setConfirmDelete(false);
    navigate(-1);
  };

  return (
    <ScreenLayout bottomNav={false}>
      <TitleBar title="Product" back />
      <div className="px-5 pb-8 space-y-4">
        <div className="w-full aspect-square rounded-[18px] border border-border overflow-hidden bg-secondary">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="size-full object-cover" />
          ) : (
            <div className="size-full flex items-center justify-center text-6xl bg-primary/10">🧴</div>
          )}
        </div>

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold leading-tight">{product.name}</h1>
            {product.brand && <p className="text-sm text-muted-foreground">{product.brand}</p>}
            {product.category && (
              <p className="text-[11px] uppercase tracking-[0.15em] text-primary mt-1">{product.category}</p>
            )}
          </div>
          <div className="size-16 rounded-full border-[3px] border-primary text-primary flex items-center justify-center text-base font-bold shrink-0">
            {score}
          </div>
        </div>

        {/* Personalised "red flag / green light" cards removed: we present
            neutral information only and leave decisions to the user. */}

        {product.ai_summary && (
          <SurfaceCard tone="gold">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">AI Summary</p>
            <p className="text-sm leading-snug">{product.ai_summary}</p>
          </SurfaceCard>
        )}

        <SurfaceCard padded={false} className="divide-y divide-border/60">
          <div className="p-3.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Last used</span>
            <span className="text-sm font-medium">
              {lastUse ? (
                <>
                  {formatDate(lastUse.date)}
                  {lastUse.stepName && <span className="text-muted-foreground"> · {lastUse.stepName}</span>}
                </>
              ) : "Never"}
            </span>
          </div>
          <div className="p-3.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Times used</span>
            <span className="text-sm font-medium">{appearances.length}</span>
          </div>
        </SurfaceCard>

        {appearances.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Wash days</p>
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {appearances.map(a => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/wash-day/${a.id}`)}
                  className="w-full p-3.5 flex items-center justify-between text-left hover:bg-primary/5"
                >
                  <span className="text-sm font-medium">{formatDate(a.date)}</span>
                  {a.stepName && <span className="text-[11px] text-muted-foreground">{a.stepName}</span>}
                </button>
              ))}
            </SurfaceCard>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Your rating</p>
          <SurfaceCard>
            <StarPicker
              value={product.rating ?? 0}
              onChange={(n) => { if (!savingRating) void updateRating(n); }}
            />
          </SurfaceCard>
        </div>

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

            {/* Legend */}
            <div className="flex items-center gap-3 mb-2 px-1 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Good for you</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Caution</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-destructive" /> Avoid</span>
            </div>

            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {ingredients.map((name, i) => {
                const lower = name.toLowerCase().trim();
                const aiFlag = aiFlagByName.get(lower);
                const tone = aiFlag?.tone;
                const dotClass =
                  tone === "good" ? "bg-emerald-500" :
                  tone === "bad"  ? "bg-destructive" :
                  tone === "warn" ? "bg-amber-500" :
                  "bg-border";
                return (
                  <div key={i} className="p-3 flex items-start gap-2.5">
                    <span
                      className={cn("size-2 rounded-full shrink-0 mt-1.5", dotClass)}
                      aria-label={tone ?? "neutral"}
                    />
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
          {product.on_shelf ? (
            <Button variant="goldOutline" size="pill" onClick={() => setShelf(product.id, false)}>
              Move to Wishlist
            </Button>
          ) : (
            <Button variant="gold" size="pill" onClick={() => setShelf(product.id, true)}>
              Move to Shelf
            </Button>
          )}

          {product.on_wishlist && (
            <Button variant="ghost" size="pill" onClick={() => setWishlist(product.id, false)}>
              Remove from Wishlist
            </Button>
          )}

          <Button
            variant="ghost"
            size="pill"
            onClick={() => setConfirmDelete(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4 mr-2" />
            Remove from app
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{product.name}</strong> and all its history from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default ProductProfile;
