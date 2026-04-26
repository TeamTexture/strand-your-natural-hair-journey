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
import { saveProductRating, recomputeIngredientFlags } from "@/hooks/useIngredientLists";
import { buildAiContext } from "@/lib/aiContext";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { cn } from "@/lib/utils";

interface Ingredient { tone: "good" | "warn" | "bad"; name: string; body: string }
interface GuidanceTip { title: string; body: string }
interface Analysis {
  match_score: number;
  summary: string;
  ingredients: Ingredient[];
  personalised_guidance?: GuidanceTip[];
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
  const [isFavourited, setIsFavourited] = useState(false);
  const [favSaving, setFavSaving] = useState(false);

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

  // Load any previously-saved rating so the stars reflect the user's choice,
  // and the favourite flag so the heart starts in the right state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      const { data: ratingRow } = await supabase
        .from("product_ratings")
        .select("rating")
        .eq("user_id", user.id)
        .eq("product_key", productKey)
        .maybeSingle();
      if (!cancelled && ratingRow?.rating) setRating(ratingRow.rating);
      const { data: favRow } = await supabase
        .from("user_products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("on_favourite" as any)
        .eq("user_id", user.id)
        .eq("product_key", productKey)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!cancelled && (favRow as any)?.on_favourite) setIsFavourited(true);
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

  const handleToggleFavourite = async () => {
    if (favSaving) return;
    if (!productKey) {
      toast.error("Missing product — open from your shelf or scan results");
      return;
    }
    const next = !isFavourited;
    setIsFavourited(next); // optimistic
    setFavSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error("Not signed in");

      // Make sure the product exists in user_products so the favourite flag
      // has somewhere to live. Use upsert keyed on (user_id, product_key).
      const ingredientNames = (analysis?.ingredients ?? []).map((i) => i.name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        user_id: user.id,
        product_key: productKey,
        name: productName || "Untitled product",
        brand: productBrand || null,
        on_favourite: next,
      };
      if (ingredientNames.length > 0) payload.ingredients = ingredientNames;

      const { error: upErr } = await supabase
        .from("user_products")
        .upsert(payload, { onConflict: "user_id,product_key" });
      if (upErr) throw upErr;

      // Recompute Green Flag list now that membership changed.
      await recomputeIngredientFlags();
      window.dispatchEvent(new CustomEvent("user-products-updated"));
      toast(next ? "❤️ Added to favourites" : "Removed from favourites");
    } catch (e: unknown) {
      setIsFavourited(!next); // rollback
      const msg = e instanceof Error ? e.message : "Could not update favourite";
      toast.error(msg);
    } finally {
      setFavSaving(false);
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
            disabled={favSaving}
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
        <SurfaceCard className="space-y-3">
          <div className="flex items-center gap-3">
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
          </div>

          <div className="pt-3 border-t border-border/60">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Your Rating</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className={cn(
                      "text-2xl transition-transform",
                      n <= rating ? "text-primary" : "text-border",
                      "hover:scale-110",
                    )}
                    aria-label={`${n} stars`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <Button
                variant="gold"
                onClick={handleSaveRating}
                disabled={saving}
                className="shrink-0 !min-h-0 h-9 px-5 rounded-pill text-xs"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
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
              <p className="text-sm leading-snug text-foreground/85 whitespace-pre-line">{analysis.summary}</p>
            </SurfaceCard>

            {analysis.personalised_guidance && analysis.personalised_guidance.length > 0 && (
              <>
                <SectionLabel>How to use this for your hair</SectionLabel>
                <SurfaceCard className="space-y-3">
                  {analysis.personalised_guidance.map((tip, idx) => (
                    <div key={`${tip.title}-${idx}`} className="flex items-start gap-3">
                      <span className="size-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{tip.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{tip.body}</p>
                      </div>
                    </div>
                  ))}
                </SurfaceCard>
              </>
            )}

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

      </div>
    </ScreenLayout>
  );
};

export default IngredientDetail;
