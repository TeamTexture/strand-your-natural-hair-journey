import { Heart, RefreshCw } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import ProductPhotoTile from "@/components/ProductPhotoTile";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useProductPhotos } from "@/hooks/useProductPhotos";
import { supabase } from "@/integrations/supabase/client";
import { saveProductRating } from "@/hooks/useIngredientLists";
import { buildAiContext } from "@/lib/aiContext";
import { cn } from "@/lib/utils";

interface Ingredient { tone: "good" | "warn" | "bad"; name: string; body: string }
interface Analysis {
  match_score: number;
  summary: string;
  ingredients: Ingredient[];
}

const dotClass: Record<Ingredient["tone"], string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-destructive",
};

const IngredientDetail = () => {
  const [rating, setRating] = useState(5);
  const [searchParams] = useSearchParams();
  const productKey = searchParams.get("key") ?? "camille-rose-moisture-retention";
  const productName = searchParams.get("name") ?? "Moisture Retention Serum";
  const productBrand = searchParams.get("brand") ?? "Camille Rose";
  const { photos, uploadPhoto, removePhoto } = useProductPhotos([productKey]);
  const photoUrl = photos[productKey]?.signedUrl ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [saving, setSaving] = useState(false);

  // Load any previously-saved rating so the stars reflect the user's choice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      const { data } = await supabase
        .from("product_ratings")
        .select("rating")
        .eq("user_id", user.id)
        .eq("product_key", productKey)
        .maybeSingle();
      if (!cancelled && data?.rating) setRating(data.rating);
    })();
    return () => {
      cancelled = true;
    };
  }, [productKey]);

  const handleSaveRating = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveProductRating({
        productKey,
        productName,
        productBrand,
        rating,
        ingredients: (analysis?.ingredients ?? []).map((i) => i.name),
      });
      if (rating <= 2) {
        toast("Rating saved — avoid list updated");
      } else if (rating >= 4) {
        toast("Rating saved — favourites updated");
      } else {
        toast("Rating saved");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save rating";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const runAnalysis = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const hairProfile = JSON.parse(
          localStorage.getItem("strand_hair_profile") || "{}",
        );
        const healthProfile = JSON.parse(
          localStorage.getItem("strand_health_profile") || "{}",
        );
        const heritage = JSON.parse(
          localStorage.getItem("strand_heritage") || "[]",
        );

        const context = await buildAiContext();
        const { data, error: fnError } = await supabase.functions.invoke(
          "ingredient-analysis",
          {
            body: {
              productKey,
              productName,
              productBrand,
              hairProfile,
              healthProfile,
              heritage,
              context,
              force,
            },
          },
        );
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        setAnalysis(data.analysis as Analysis);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not analyse this product.";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [productKey, productName, productBrand],
  );

  useEffect(() => {
    runAnalysis(false);
  }, [runAnalysis]);

  const matchScore = analysis?.match_score ?? null;
  const scoreTone =
    matchScore == null
      ? "text-muted-foreground border-border"
      : matchScore >= 80
      ? "text-good border-good"
      : matchScore >= 55
      ? "text-warn border-warn"
      : "text-destructive border-destructive";

  return (
    <ScreenLayout>
      <TitleBar
        title="Ingredient Analysis"
        right={
          <button
            onClick={() => toast("Added to favourites")}
            aria-label="Favourite"
            className="text-primary"
          >
            <Heart className="size-5" />
          </button>
        }
      />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="flex items-center gap-3">
          <ProductPhotoTile
            imageUrl={photoUrl}
            fallbackEmoji="🧴"
            size="size-14"
            onPick={(f) => uploadPhoto(productKey, f, { name: productName, brand: productBrand })}
            onRemove={() => removePhoto(productKey)}
          />
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold leading-tight">{productName}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">{productBrand}</p>
          </div>
          <div className="text-center">
            <div
              className={cn(
                "size-12 rounded-full border-2 flex items-center justify-center font-bold",
                scoreTone,
              )}
            >
              {loading ? "…" : matchScore ?? "—"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Match</p>
          </div>
        </SurfaceCard>

        {loading && (
          <SurfaceCard>
            <LoadingDot label="Analysing ingredients for your profile…" />
          </SurfaceCard>
        )}

        {error && !loading && (
          <SurfaceCard tone="orange" className="space-y-2">
            <p className="text-sm">Could not analyse this product.</p>
            <Button variant="goldGhost" size="pill" onClick={() => runAnalysis(true)}>
              <RefreshCw className="size-4 mr-1" /> Retry
            </Button>
          </SurfaceCard>
        )}

        {analysis && !loading && (
          <>
            <SurfaceCard tone="gold">
              <p className="text-xs font-semibold mb-1">🤖 AI Summary</p>
              <p className="text-sm leading-snug text-foreground/85">{analysis.summary}</p>
            </SurfaceCard>

            <SectionLabel>Ingredient breakdown</SectionLabel>
            <SurfaceCard className="divide-y divide-border/60 !py-1">
              {analysis.ingredients.map((i, idx) => (
                <div key={`${i.name}-${idx}`} className="flex items-start gap-3 py-3">
                  <span className={cn("size-2.5 rounded-full mt-1.5 shrink-0", dotClass[i.tone])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-body leading-tight">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{i.body}</p>
                  </div>
                </div>
              ))}
            </SurfaceCard>

          </>
        )}

        {/* "Re-run analysis" intentionally removed — analysis runs once on
         * load (and on retry after error). */}
        {false && null}

        <SectionLabel>Your voicenotes</SectionLabel>
        <SurfaceCard>
          <ProductVoicenotes
            productKey={productKey}
            productName={productName}
            productBrand={productBrand}
          />
        </SurfaceCard>

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Your Rating</p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn("text-3xl transition-transform", n <= rating ? "text-primary" : "text-border", "hover:scale-110")}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="gold"
          size="pill"
          onClick={handleSaveRating}
          disabled={saving || loading || !analysis}
        >
          {saving ? "Saving…" : "Save Rating"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default IngredientDetail;
