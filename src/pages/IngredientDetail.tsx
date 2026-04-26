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
import { loadClinicalContext } from "@/lib/clinicalContext";
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
  // No hardcoded brand/product fallbacks — if these are missing the page
  // simply shows the empty state until a product is provided via the URL.
  const productKey = searchParams.get("key") ?? "";
  const productName = searchParams.get("name") ?? "";
  const productBrand = searchParams.get("brand") ?? "";
  const { photos, uploadPhoto, removePhoto } = useProductPhotos([productKey]);
  const [productPhotoUrl, setProductPhotoUrl] = useState<string | null>(null);
  const photoUrl = photos[productKey]?.signedUrl ?? productPhotoUrl;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [saving, setSaving] = useState(false);

  // Fallback: if no separate photo upload exists, use the image stored on
  // the user's product (uploaded during scan or pulled from the product URL).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      const { data } = await supabase
        .from("user_products")
        .select("image_url, storage_path")
        .eq("user_id", user.id)
        .eq("product_key", productKey)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.storage_path) {
        const { data: sig } = await supabase.storage
          .from("product-photos")
          .createSignedUrl(data.storage_path, 3600);
        if (!cancelled && sig?.signedUrl) {
          setProductPhotoUrl(sig.signedUrl);
          return;
        }
      }
      if (!cancelled && data.image_url) setProductPhotoUrl(data.image_url);
    })();
    return () => {
      cancelled = true;
    };
  }, [productKey]);

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
        const clinical = await loadClinicalContext();
        const hairProfile = clinical.hair ?? {};
        const healthProfile = clinical.health ?? {};
        const heritage = clinical.basic?.heritage ?? [];

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

  const isFavourited = rating >= 4;
  const handleToggleFavourite = async () => {
    if (saving) return;
    const nextRating = isFavourited ? 0 : 5;
    setRating(nextRating);
    setSaving(true);
    try {
      await saveProductRating({
        productKey,
        productName,
        productBrand,
        rating: nextRating,
        ingredients: (analysis?.ingredients ?? []).map((i) => i.name),
      });
      toast(isFavourited ? "Removed from favourites" : "❤️ Added to favourites");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not update favourite";
      toast.error(msg);
      setRating(rating); // rollback
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar
        title="Ingredient Analysis"
        right={
          <button
            onClick={handleToggleFavourite}
            aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={isFavourited}
            disabled={saving}
            className={cn(
              "min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors",
              isFavourited ? "text-destructive" : "text-muted-foreground hover:text-destructive",
            )}
          >
            <Heart className={cn("size-5", isFavourited && "fill-current")} />
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
