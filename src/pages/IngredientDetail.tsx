import { Flag, RefreshCw, Trash2, Bookmark, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import ProductPhotoTile from "@/components/ProductPhotoTile";
import OffShelfReasonSheet from "@/components/OffShelfReasonSheet";
import LoadingDot from "@/components/LoadingDot";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProductPhotos } from "@/hooks/useProductPhotos";
import { useUserProducts } from "@/hooks/useUserProducts";
import { supabase } from "@/integrations/supabase/client";
import { saveProductRating, recomputeIngredientFlags, useIngredientLists } from "@/hooks/useIngredientLists";
import { buildAiContext } from "@/lib/aiContext";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { cn } from "@/lib/utils";

interface Ingredient {
  tone: "good" | "warn" | "bad";
  name: string;
  body: string;
  category?: string;
}
interface GuidanceTip { title: string; body: string }
interface Analysis {
  match_score: number;
  summary: string;
  ingredients: Ingredient[];
  personalised_guidance?: GuidanceTip[];
}

const formatRelative = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  const now = Date.now();
  const diffH = (now - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 24) return "today";
  if (diffH < 48) return "yesterday";
  const days = Math.floor(diffH / 24);
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} wks ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const IngredientDetail = () => {
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [searchParams] = useSearchParams();

  const productKey = searchParams.get("key") ?? "";
  const productName = searchParams.get("name") ?? "";
  const productBrand = searchParams.get("brand") ?? "";

  const { photos, uploadPhoto, removePhoto } = useProductPhotos([productKey]);
  const [productPhotoUrl, setProductPhotoUrl] = useState<string | null>(null);
  const photoUrl = photos[productKey]?.signedUrl ?? productPhotoUrl;

  const { allProducts, setShelf, setWishlist, remove, reload } = useUserProducts("all");
  const productRow = useMemo(
    () => allProducts.find((p) => p.product_key === productKey) ?? null,
    [allProducts, productKey],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offShelfOpen, setOffShelfOpen] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);

  const { flags } = useIngredientLists();
  // Single unified "flagged" set — appears in 3+ of the user's products.
  const flaggedNames = useMemo(
    () => new Set(flags.map((r) => r.ingredient.toLowerCase())),
    [flags],
  );

  // For "Used in N other products" lookup: index user's products by lowercased
  // ingredient name. Excludes the current product.
  const productsByIngredient = useMemo(() => {
    const map = new Map<string, Array<{ id: string; key: string; name: string; brand: string | null }>>();
    for (const p of allProducts) {
      if (p.product_key === productKey) continue;
      for (const ing of p.ingredients ?? []) {
        const k = ing.toLowerCase().trim();
        if (!k) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push({ id: p.id, key: p.product_key, name: p.name, brand: p.brand });
      }
    }
    return map;
  }, [allProducts, productKey]);

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

  // Hydrate rating from product row (or product_ratings fallback).
  useEffect(() => {
    if (productRow?.rating) {
      setRating(productRow.rating);
      return;
    }
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
    })();
    return () => {
      cancelled = true;
    };
  }, [productKey, productRow?.rating]);

  const handleSaveRating = async () => {
    if (saving || rating === 0) return;
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
    if (productKey) runAnalysis(false);
  }, [runAnalysis, productKey]);

  // ── Shelf state derived flags (drives bottom action button choice) ─────
  const onShelf = !!productRow?.on_shelf;
  const onWishlist = !!productRow?.on_wishlist;
  const previouslyOnShelf = !!productRow?.previously_on_shelf;
  const status: "shelf" | "wishlist" | "off-shelf" | "unknown" =
    onShelf ? "shelf" : onWishlist ? "wishlist" : previouslyOnShelf ? "off-shelf" : "unknown";

  // ── Bottom-row actions ─────────────────────────────────────────────────
  const handleAddToShelf = async () => {
    if (!productRow) return;
    setShelfBusy(true);
    try {
      await setShelf(productRow.id, true);
      toast.success(`${productRow.name} added to your shelf`);
    } finally {
      setShelfBusy(false);
    }
  };

  const handleAddToWishlist = async () => {
    if (!productRow) return;
    setShelfBusy(true);
    try {
      await setWishlist(productRow.id, true);
      toast.success(`${productRow.name} added to your wishlist`);
    } finally {
      setShelfBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!productRow) return;
    setShelfBusy(true);
    try {
      await remove(productRow.id);
      toast.success("Removed from your products");
      navigate(-1);
    } finally {
      setShelfBusy(false);
    }
  };

  const onShelfReasonComplete = async () => {
    await reload();
    await recomputeIngredientFlags();
  };

  return (
    <ScreenLayout>
      <TitleBar title="Product" />

      <div className="px-5 pb-8 space-y-4">
        {/* ── HERO: image + title + brand link ─────────────────────────── */}
        <div className="flex flex-col items-center text-center pt-1 pb-2">
          <ProductPhotoTile
            imageUrl={photoUrl}
            fallbackEmoji="🧴"
            size="size-56"
            className="mb-3"
            onPick={(f) => uploadPhoto(productKey, f, { name: productName, brand: productBrand })}
            onRemove={() => removePhoto(productKey)}
          />
          <h1 className="font-display text-xl font-semibold leading-tight max-w-[280px]">
            {productName || "Untitled product"}
          </h1>
          {productBrand && (
            <button
              type="button"
              onClick={() =>
                navigate(`/products/brand/${encodeURIComponent(productBrand)}`)
              }
              className="mt-1 text-[11px] uppercase tracking-[0.18em] text-primary underline-offset-4 hover:underline"
            >
              {productBrand}
            </button>
          )}
          {status !== "unknown" && (
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {status === "shelf"
                ? "On your shelf"
                : status === "wishlist"
                ? "On your wishlist"
                : "Off your shelf"}
            </p>
          )}
        </div>

        {/* ── Last used / use count / rating row ───────────────────────── */}
        <SurfaceCard className="space-y-3">
          {productRow && (
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/60">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last used</span>
                <span className="text-sm font-medium">{formatRelative(productRow.last_used_at) ?? "Never"}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Times used</span>
                <span className="text-sm font-medium">{productRow.use_count ?? 0}</span>
              </div>
            </div>
          )}

          <div>
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
                disabled={saving || rating === 0}
                className="shrink-0 !min-h-0 h-7 px-3.5 rounded-pill text-[10px] tracking-[0.12em]"
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
            {/* AI Summary — personalised to hair, health, lifestyle */}
            <SurfaceCard tone="gold">
              <p className="text-xs font-semibold mb-1">🤖 AI Summary</p>
              <p className="text-sm leading-snug text-foreground/85 whitespace-pre-line">
                {analysis.summary}
              </p>
            </SurfaceCard>

            {/* Personalised "How to use this for your hair" */}
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
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">
                          {tip.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </SurfaceCard>
              </>
            )}

            <SectionLabel>Active ingredients</SectionLabel>
            <p className="px-1 -mt-1 mb-2 text-[11px] text-muted-foreground italic leading-snug">
              Showing the functional ingredients that actually do something for
              your hair (actives, humectants, proteins, conditioning agents,
              etc.). Fillers, preservatives, fragrance and pH adjusters are
              hidden to keep this list useful.
            </p>
            <SurfaceCard className="divide-y divide-border/60 !py-1">
              {(() => {
                // Categories that meaningfully act on hair — everything else
                // (preservative, solvent, fragrance, colourant, pH adjuster,
                // chelator, emulsifier, thickener) is filler from the user's
                // perspective and is hidden to reduce overwhelm.
                const ACTIVE_CATEGORIES = new Set([
                  "active",
                  "humectant",
                  "emollient",
                  "occlusive",
                  "surfactant",
                  "conditioning agent",
                  "protein",
                  "antioxidant",
                  "botanical extract",
                ]);
                const visible = (analysis.ingredients ?? []).filter((i) => {
                  const lower = i.name.toLowerCase().trim();
                  // Always keep flagged ingredients — they should surface
                  // regardless of category.
                  if (flaggedNames.has(lower)) return true;
                  const cat = (i.category ?? "").toLowerCase().trim();
                  return ACTIVE_CATEGORIES.has(cat);
                });
                if (visible.length === 0) {
                  return (
                    <p className="text-[11px] text-muted-foreground py-3 text-center">
                      No active ingredients identified for this product.
                    </p>
                  );
                }
                return visible.map((i, idx) => {
                  const lower = i.name.toLowerCase().trim();
                  // Single unified gold flag — populated when an ingredient
                  // appears in 3+ of the user's products. Educational only.
                  const isFlagged = flaggedNames.has(lower);
                  const otherProducts = productsByIngredient.get(lower) ?? [];
                  return (
                    <div key={`${i.name}-${idx}`} className="flex items-start gap-3 py-3">
                      <span
                        className="mt-0.5 shrink-0 w-5 flex items-center justify-center"
                        aria-label={isFlagged ? "flagged ingredient" : "ingredient"}
                      >
                        {isFlagged ? (
                          <Flag className="size-4 text-primary fill-primary" />
                        ) : null}
                      </span>
                      <div className="flex-1 min-w-0">
                        {i.category && (
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-0.5">
                            {i.category}
                          </p>
                        )}
                        <p className="text-sm font-medium font-body leading-tight">{i.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {i.body}
                        </p>
                        {otherProducts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              // Always go through the canonical /products/profile/:id
                              // redirect so every entry-point lands on the unified
                              // product page in the exact same way.
                              if (otherProducts.length === 1) {
                                const o = otherProducts[0];
                                navigate(`/products/profile/${o.id}`);
                              } else {
                                navigate(
                                  `/products/by-ingredient?ingredient=${encodeURIComponent(i.name)}`,
                                );
                              }
                            }}
                            className="mt-1.5 text-[11px] text-primary underline-offset-4 hover:underline"
                          >
                            Used in {otherProducts.length} other {otherProducts.length === 1 ? "product" : "products"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </SurfaceCard>
          </>
        )}

        {/* Voicenotes */}
        <SectionLabel>Your voicenotes</SectionLabel>
        <SurfaceCard>
          <ProductVoicenotes
            productKey={productKey}
            productName={productName}
            productBrand={productBrand}
          />
        </SurfaceCard>

        {/* ── Bottom shelf actions (context-aware) ────────────────────── */}
        {productRow && (
          <div className="space-y-2 pt-2">
            {status === "shelf" && (
              <Button
                variant="goldGhost"
                size="pill"
                className="w-full"
                onClick={() => setOffShelfOpen(true)}
                disabled={shelfBusy}
              >
                <ArrowUpFromLine className="size-4 mr-1.5" /> Take off the shelf
              </Button>
            )}
            {(status === "shelf" || status === "off-shelf") && (
              <Button
                variant="ghost"
                size="pill"
                className="w-full"
                onClick={handleAddToWishlist}
                disabled={shelfBusy}
              >
                <Bookmark className="size-4 mr-1.5" /> Add to wishlist
              </Button>
            )}
            {(status === "wishlist" || status === "off-shelf") && (
              <Button
                variant="gold"
                size="pill"
                className="w-full"
                onClick={handleAddToShelf}
                disabled={shelfBusy}
              >
                <ArrowDownToLine className="size-4 mr-1.5" />{" "}
                {status === "off-shelf" ? "Put back on shelf" : "Add to shelf"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="pill"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={shelfBusy}
            >
              <Trash2 className="size-4 mr-1.5" /> Remove from app
            </Button>
          </div>
        )}
      </div>

      {productRow && (
        <>
          <OffShelfReasonSheet
            open={offShelfOpen}
            onOpenChange={setOffShelfOpen}
            productId={productRow.id}
            productKey={productRow.product_key}
            productName={productRow.name}
            onComplete={onShelfReasonComplete}
          />
          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this product?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes "{productRow.name}" from your products,
                  ratings, and any flag lists derived from it. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleConfirmDelete}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </ScreenLayout>
  );
};

export default IngredientDetail;
