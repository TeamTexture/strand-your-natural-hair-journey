import { Flag, RefreshCw, Trash2, Bookmark, ArrowDownToLine, ArrowUpFromLine, Heart } from "lucide-react";
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
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useProductPhotos } from "@/hooks/useProductPhotos";
import { useUserProducts } from "@/hooks/useUserProducts";
import { supabase } from "@/integrations/supabase/client";
import { saveProductRating, recomputeIngredientFlags, useIngredientLists } from "@/hooks/useIngredientLists";
import { useIngredientProfile } from "@/hooks/useIngredientProfile";
import { buildAiContext } from "@/lib/aiContext";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
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
  // Fresh-scan extras (from product-analyse, optional for cached path):
  usage_instructions?: string;
  use_cases?: string[];
  tips?: string[];
}

// Shape returned by the product-analyse edge function (passed via route state
// from ProductScanning). Only the fields we actually consume are typed here.
interface FreshAnalysisPayload {
  product_name?: string;
  brand?: string;
  ingredients?: string[];
  key_ingredients?: Array<{ name: string; benefit?: string; flag?: "good" | "warn" | "avoid"; reason?: string }>;
  match_score?: number;
  ai_summary?: string;
  usage_instructions?: string;
  use_cases?: string[];
  tips?: string[];
}

/** Convert a fresh product-analyse payload into the local Analysis shape so
 *  the existing renderer can display it without going through ingredient-analysis. */
function freshToAnalysis(fresh: FreshAnalysisPayload): Analysis {
  const flagToTone = (f?: string): Ingredient["tone"] =>
    f === "avoid" ? "bad" : f === "good" ? "good" : "warn";
  // Build a body lookup from key_ingredients so chip-tap shows the per-ingredient
  // benefit/reason without another round-trip.
  const keyMap = new Map<string, { benefit?: string; flag?: string; reason?: string }>();
  for (const k of fresh.key_ingredients ?? []) {
    keyMap.set(k.name.toLowerCase().trim(), { benefit: k.benefit, flag: k.flag, reason: k.reason });
  }
  const ingredients: Ingredient[] = (fresh.ingredients ?? []).map((name) => {
    const k = keyMap.get(name.toLowerCase().trim());
    return {
      name,
      tone: flagToTone(k?.flag),
      body: k?.benefit || k?.reason || "",
    };
  });
  return {
    match_score: typeof fresh.match_score === "number" ? fresh.match_score : 0,
    summary: fresh.ai_summary ?? "",
    ingredients,
    usage_instructions: fresh.usage_instructions,
    use_cases: fresh.use_cases,
    tips: fresh.tips,
  };
}

/** First-sentence extractor for collapsed AI summary. Falls back to a
 *  trimmed substring + ellipsis when no terminal punctuation is found. */
const firstSentence = (text: string): string => {
  const match = text.match(/^[^.!?]+[.!?]/);
  if (match) return match[0];
  return text.length > 120 ? text.substring(0, 120).trim() + "…" : text;
};

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
  const location = useLocation();
  const [rating, setRating] = useState(0);
  const [searchParams] = useSearchParams();

  const productKey = searchParams.get("key") ?? "";
  const productName = searchParams.get("name") ?? "";
  const productBrand = searchParams.get("brand") ?? "";

  // Fresh-scan payload passed from ProductScanning / useProductUrlScan via
  // route state. When present we render directly from this and skip the
  // ingredient-analysis round-trip (which is for already-saved products).
  const navState = location.state as {
    analysis?: FreshAnalysisPayload;
    storage_path?: string;
    preview_url?: string;
    intent?: "shelf" | "wishlist";
    auto_save?: boolean;
    returnTo?: string;
    product_key?: string;
  } | null;
  const freshAnalysis = navState?.analysis ?? null;
  const navIntent: "shelf" | "wishlist" = navState?.intent ?? "shelf";
  const autoSave = navState?.auto_save ?? false;
  const returnTo = navState?.returnTo ?? null;

  const { photos, uploadPhoto, removePhoto } = useProductPhotos([productKey]);
  const [productPhotoUrl, setProductPhotoUrl] = useState<string | null>(
    (location.state as { preview_url?: string } | null)?.preview_url ?? null,
  );
  const photoUrl = photos[productKey]?.signedUrl ?? productPhotoUrl;

  const { allProducts, loading: productsLoading, setShelf, setWishlist, setFavourite, remove, reload, upsert } = useUserProducts("all");
  const productRow = useMemo(
    () => allProducts.find((p) => p.product_key === productKey) ?? null,
    [allProducts, productKey],
  );

  // Initial loading state: only show the spinner when we have no fresh
  // analysis to render immediately.
  const [loading, setLoading] = useState(!freshAnalysis);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(
    freshAnalysis ? freshToAnalysis(freshAnalysis) : null,
  );
  const [savingToShelf, setSavingToShelf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offShelfOpen, setOffShelfOpen] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [useCasesExpanded, setUseCasesExpanded] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(false);

  const { flags } = useIngredientLists();
  // Single unified "flagged" set — appears in 3+ of the user's products.
  const flaggedNames = useMemo(
    () => new Set(flags.map((r) => r.ingredient.toLowerCase())),
    [flags],
  );

  // Other ingredients in the same formulation, used to give the AI
  // context for the "what this means for your hair type" guidance.
  const formulationNames = useMemo(
    () => (analysis?.ingredients ?? []).map((i) => i.name),
    [analysis],
  );
  const otherFormulationNames = useMemo(
    () =>
      formulationNames.filter(
        (n) => n.toLowerCase().trim() !== (selectedIngredient?.name ?? "").toLowerCase().trim(),
      ),
    [formulationNames, selectedIngredient],
  );

  const reasonForFlag = selectedIngredient && flaggedNames.has(selectedIngredient.name.toLowerCase().trim())
    ? "Appears in 3 or more of the user's favourite shelf products that are actively in use"
    : undefined;

  const ingredientProfile = useIngredientProfile(
    selectedIngredient?.name ?? null,
    reasonForFlag,
    !!selectedIngredient,
    {
      productKey,
      productName,
      productBrand,
      formulationIngredients: otherFormulationNames,
    },
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
    // Fresh-scan path: analysis is already in state, no need to re-fetch.
    if (freshAnalysis) return;
    if (productKey) runAnalysis(false);
  }, [runAnalysis, productKey, freshAnalysis]);

  // Save the freshly-scanned product into user_products. The scanning flow
  // already attempts this upsert, but we re-run it here to (a) cover the
  // case where the user lands here without a saved row and (b) honour an
  // explicit "Save to shelf / wishlist" CTA.
  const persistFreshScan = useCallback(
    async (intent: "shelf" | "wishlist") => {
      if (!freshAnalysis || !productKey) return null;
      setSavingToShelf(true);
      try {
        const saveFields = buildProductSaveFields(freshAnalysis, productName || "Untitled product");
        const saved = await upsert({
          product_key: productKey,
          ...saveFields,
          brand: saveFields.brand ?? (productBrand || null),
          storage_path: navState?.storage_path ?? null,
          on_shelf: intent === "shelf",
          on_wishlist: intent === "wishlist",
          ...(intent === "shelf" ? { added_to_shelf_at: new Date().toISOString() } : {}),
        });
        // Cache the analysis so future visits via the saved-products path can
        // read it back without re-running ingredient-analysis.
        try {
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData?.user?.id;
          if (uid) {
            await supabase.from("ai_summaries").insert({
              user_id: uid,
              kind: `product_analyse:${productKey}`,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              payload: freshAnalysis as any,
            });
          }
        } catch (cacheErr) {
          // Cache failures are non-fatal — the row is already in user_products.
          console.warn("ai_summaries cache write failed", cacheErr);
        }
        return saved;
      } finally {
        setSavingToShelf(false);
      }
    },
    [freshAnalysis, productKey, productName, productBrand, navState?.storage_path, upsert],
  );

  // Auto-save flow (e.g. journal / wash-day). Persist immediately, then bounce
  // the user back to where they came from.
  const autoSaveDoneRef = useState({ done: false })[0];
  useEffect(() => {
    if (!freshAnalysis || !autoSave || autoSaveDoneRef.done) return;
    autoSaveDoneRef.done = true;
    (async () => {
      const saved = await persistFreshScan(navIntent);
      if (saved && returnTo) {
        navigate(returnTo, { replace: true });
      }
    })();
  }, [freshAnalysis, autoSave, navIntent, returnTo, persistFreshScan, navigate, autoSaveDoneRef]);

  const handleSaveFreshTo = async (intent: "shelf" | "wishlist") => {
    const saved = await persistFreshScan(intent);
    if (saved) {
      toast.success(
        intent === "shelf"
          ? `${saved.name} added to your shelf`
          : `${saved.name} added to your wishlist`,
      );
    }
  };

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
      navigate("/products", { state: { defaultTab: "shelf" } });
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
      // Wishlist has its own route — send the user there directly so the
      // mental loop "I just put this on my wishlist → here it is" closes.
      navigate("/products/wishlist");
    } finally {
      setShelfBusy(false);
    }
  };

  const handleToggleFavourite = async () => {
    if (!productRow) return;
    const next = !productRow.on_favourite;
    if (next && !productRow.on_shelf) {
      toast.error("Add this product to your shelf before favouriting it");
      return;
    }
    setShelfBusy(true);
    try {
      await setFavourite(productRow.id, next);
      toast.success(next ? "Added to favourites" : "Removed from favourites");
    } finally {
      setShelfBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!productRow) return;
    setShelfBusy(true);
    try {
      await remove(productRow.id);
      toast.success("Product removed");
      navigate("/products");
    } finally {
      setShelfBusy(false);
    }
  };

  const onShelfReasonComplete = async () => {
    await reload();
    await recomputeIngredientFlags();
  };

  // ── Discard-on-abandon guard ────────────────────────────────────────
  // When the user lands here from a fresh scan and the product is still in
  // NEUTRAL state (no shelf/wishlist decision made), warn before leaving and
  // delete the orphan user_products row on confirm.
  const isFreshScan = !!freshAnalysis;
  const inNeutralState = !!productRow && !productRow.on_shelf && !productRow.on_wishlist && !productRow.previously_on_shelf;
  const ctaChosenRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavRef = useRef<null | (() => void)>(null);

  const shouldGuard = isFreshScan && inNeutralState && !autoSave && !ctaChosenRef.current;

  // Intercept browser back (popstate) so we can show the discard dialog.
  useEffect(() => {
    if (!shouldGuard) return;
    // Push a sentinel history entry so the first back press fires popstate
    // without leaving the page.
    window.history.pushState({ __strandGuard: true }, "");
    const onPop = () => {
      pendingNavRef.current = () => {
        // Allow real back after discard.
        window.history.go(-1);
      };
      setDiscardOpen(true);
      // Re-push so subsequent backs are also captured until user decides.
      window.history.pushState({ __strandGuard: true }, "");
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [shouldGuard]);

  // Intercept in-app link clicks (BottomNav tabs, brand link, etc.) while
  // the guard is active. Any anchor whose pathname differs from the current
  // route opens the discard dialog instead of navigating.
  useEffect(() => {
    if (!shouldGuard) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = (e.target as HTMLElement | null)?.closest("a") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || target.target === "_blank") return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
        e.preventDefault();
        e.stopPropagation();
        pendingNavRef.current = () => navigate(url.pathname + url.search + url.hash);
        setDiscardOpen(true);
      } catch {
        // ignore
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [shouldGuard, navigate]);

  const handleConfirmDiscard = async () => {
    setDiscardOpen(false);
    try {
      if (productRow) {
        await remove(productRow.id);
      }
    } catch (err) {
      console.warn("discard delete failed", err);
    }
    ctaChosenRef.current = true; // disable guard for the actual nav
    const next = pendingNavRef.current;
    pendingNavRef.current = null;
    if (next) {
      next();
    } else {
      navigate("/products");
    }
  };

  const handleCancelDiscard = () => {
    setDiscardOpen(false);
    pendingNavRef.current = null;
  };

  const handleBack = () => {
    if (shouldGuard) {
      pendingNavRef.current = () => {
        if (window.history.state && window.history.state.idx > 0) navigate(-1);
        else navigate("/products");
      };
      setDiscardOpen(true);
      return;
    }
    // If we got here via a redirect (replace: true) or a page reload, the
    // history stack may not have a sensible previous entry — fall back to
    // the products list so the back button always does something visible.
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/products");
    }
  };

  // Explicit not-found state. We never silently bounce — that was the
  // original bug. If the product isn't on the shelf and we don't have a
  // fresh analysis to show, surface a clear message + a manual back action.
  const missingProduct =
    !!productKey && !productsLoading && !productRow && !freshAnalysis;

  if (missingProduct) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Product" onBack={handleBack} />
        <div className="px-5 pt-6 space-y-4">
          <SurfaceCard tone="orange" className="space-y-3">
            <p className="text-sm font-medium">This product isn't in your shelf.</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We couldn't find a saved analysis for this product, and no fresh
              scan was passed in. Try scanning it again, or head back to your
              products list.
            </p>
            <Button variant="goldGhost" size="pill" onClick={() => navigate("/products")}>
              Back to my products
            </Button>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Product" onBack={handleBack} />

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
          <div className="flex items-center gap-2 max-w-[300px]">
            <h1 className="font-display text-xl font-semibold leading-tight">
              {productName || "Untitled product"}
            </h1>
            {productRow && (
              <button
                type="button"
                onClick={handleToggleFavourite}
                disabled={shelfBusy}
                aria-label={productRow.on_favourite ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={productRow.on_favourite}
                className="shrink-0 p-1 -m-1 transition active:scale-90 disabled:opacity-50"
              >
                <Heart
                  className={cn(
                    "size-6 transition-colors",
                    productRow.on_favourite
                      ? "fill-primary text-primary"
                      : "text-muted-foreground hover:text-primary",
                  )}
                />
              </button>
            )}
          </div>
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
          {(status === "shelf" || status === "wishlist" || status === "off-shelf") && (
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
              {(() => {
                const full = analysis.summary ?? "";
                const teaser = firstSentence(full);
                const hasMore = teaser.length < full.length;
                return (
                  <>
                    <p className="text-sm leading-snug text-foreground/85 whitespace-pre-line">
                      {summaryExpanded || !hasMore ? full : teaser}
                    </p>
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => setSummaryExpanded((v) => !v)}
                        className="mt-2 text-[10px] uppercase tracking-[0.18em] text-primary"
                      >
                        {summaryExpanded ? "Read less" : "Read more"}
                      </button>
                    )}
                  </>
                );
              })()}
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

            <SectionLabel>Ingredients</SectionLabel>
            <p className="px-1 -mt-1 mb-2 text-[11px] text-muted-foreground italic leading-snug">
              Every ingredient in this formulation. Tap a bubble to learn what
              it is, what category it falls under, and how it's used in this
              product. A small flag marks ingredients that appear in 3+ of the
              products you've put on your shelf, favourited, and actually used.
            </p>
            <div className="rounded-2xl bg-white border border-border/60 p-4">
              {(() => {
                const all = analysis.ingredients ?? [];
                if (all.length === 0) {
                  return (
                    <p className="text-[11px] text-muted-foreground py-2 text-center">
                      No ingredients listed for this product.
                    </p>
                  );
                }
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {all.map((i, idx) => {
                      const lower = i.name.toLowerCase().trim();
                      const isFlagged = flaggedNames.has(lower);
                      return (
                        <button
                          key={`${i.name}-${idx}`}
                          type="button"
                          onClick={() => setSelectedIngredient(i)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-[11px] font-medium leading-tight hover:bg-primary/90 active:scale-[0.97] transition"
                        >
                          {isFlagged && (
                            <Flag
                              className="size-3 shrink-0 fill-current"
                              style={{ color: "hsl(40 65% 32%)" }}
                              aria-label="flagged ingredient"
                            />
                          )}
                          <span className="truncate max-w-[180px]">{i.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Fresh-scan extras: usage_instructions + personalised use_cases + tips. */}
            {analysis.usage_instructions && analysis.usage_instructions.trim().length > 0 && (
              <>
                <SectionLabel>How to use it</SectionLabel>
                <SurfaceCard>
                  <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line">
                    {analysis.usage_instructions}
                  </p>
                </SurfaceCard>
              </>
            )}

            {analysis.use_cases && analysis.use_cases.length > 0 && (
              <>
                <SectionLabel>How to use this for your hair</SectionLabel>
                <SurfaceCard className="space-y-2">
                  {(useCasesExpanded ? analysis.use_cases : analysis.use_cases.slice(0, 1)).map((tip, idx) => (
                    <div key={`uc-${idx}`} className="flex items-start gap-2">
                      <span className="text-primary shrink-0 mt-1">•</span>
                      <p className="text-sm leading-relaxed text-foreground/85">{tip}</p>
                    </div>
                  ))}
                  {analysis.use_cases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setUseCasesExpanded((v) => !v)}
                      className="text-[10px] uppercase tracking-[0.18em] text-primary mt-1"
                    >
                      {useCasesExpanded
                        ? "Show less"
                        : `Read ${analysis.use_cases.length - 1} more tip${analysis.use_cases.length - 1 === 1 ? "" : "s"}`}
                    </button>
                  )}
                </SurfaceCard>
              </>
            )}

            {analysis.tips && analysis.tips.length > 0 && (
              <>
                <SectionLabel>Personalised tips</SectionLabel>
                <SurfaceCard className="space-y-2">
                  {(tipsExpanded ? analysis.tips : analysis.tips.slice(0, 1)).map((tip, idx) => (
                    <div key={`tip-${idx}`} className="flex items-start gap-2">
                      <span className="text-primary shrink-0 mt-1">•</span>
                      <p className="text-sm leading-relaxed text-foreground/85">{tip}</p>
                    </div>
                  ))}
                  {analysis.tips.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTipsExpanded((v) => !v)}
                      className="text-[10px] uppercase tracking-[0.18em] text-primary mt-1"
                    >
                      {tipsExpanded
                        ? "Show less"
                        : `Read ${analysis.tips.length - 1} more tip${analysis.tips.length - 1 === 1 ? "" : "s"}`}
                    </button>
                  )}
                </SurfaceCard>
              </>
            )}
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

        {/* ── Save CTA for fresh scans not yet on the shelf ──────────────
         *  Hidden when auto_save is on (the effect handles persistence and
         *  navigates the user back to returnTo automatically). */}
        {freshAnalysis && !productRow && !autoSave && (
          <div className="space-y-2 pt-2">
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => handleSaveFreshTo("shelf")}
              disabled={savingToShelf}
            >
              <ArrowDownToLine className="size-4 mr-1.5" />
              {savingToShelf ? "Saving…" : "Save to my shelf"}
            </Button>
            <Button
              variant="goldGhost"
              size="pill"
              className="w-full"
              onClick={() => handleSaveFreshTo("wishlist")}
              disabled={savingToShelf}
            >
              <Bookmark className="size-4 mr-1.5" /> Save to my wishlist
            </Button>
          </div>
        )}

        {/* ── Bottom shelf actions (context-aware) ────────────────────── */}
        {productRow && status === "unknown" && (
          <>
            <SectionLabel className="!px-0">What would you like to do with this product?</SectionLabel>
            <div className="space-y-2">
              <Button
                variant="gold"
                size="pill"
                className="w-full"
                onClick={handleAddToShelf}
                disabled={shelfBusy}
              >
                <ArrowDownToLine className="size-4 mr-1.5" /> Add to my shelf
              </Button>
              <Button
                variant="goldOutline"
                size="pill"
                className="w-full"
                onClick={handleAddToWishlist}
                disabled={shelfBusy}
              >
                <Bookmark className="size-4 mr-1.5" /> Add to my wishlist
              </Button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={shelfBusy}
                className="w-full text-center text-[12px] text-destructive/80 hover:text-destructive underline-offset-4 hover:underline py-2 disabled:opacity-50"
              >
                Remove from app
              </button>
            </div>
          </>
        )}

        {productRow && status !== "unknown" && (
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

      <Dialog
        open={!!selectedIngredient}
        onOpenChange={(o) => !o && setSelectedIngredient(null)}
      >
        <DialogContent className="max-w-[340px] rounded-2xl">
          {selectedIngredient && (() => {
            const ing = selectedIngredient;
            const lower = ing.name.toLowerCase().trim();
            const isFlagged = flaggedNames.has(lower);
            const profile = ingredientProfile.data;
            const meansForYou = profile?.what_it_means_for_you;
            const whatItIs = profile?.what_it_is;
            // deep_dive removed in v5 — popup is now succinct (what_it_is + benefits + what_it_means_for_you).
            const benefits = profile?.benefits ?? [];
            const profileLoading = ingredientProfile.isLoading || ingredientProfile.isFetching;
            const profileError = ingredientProfile.isError;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-lg leading-tight flex items-start gap-2">
                    {isFlagged && (
                      <Flag
                        className="size-4 mt-1 shrink-0 fill-current"
                        style={{ color: "hsl(40 65% 32%)" }}
                        aria-label="flagged ingredient"
                      />
                    )}
                    <span className="flex-1">{ing.name}</span>
                  </DialogTitle>
                  {ing.category && (
                    <DialogDescription className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary mt-0.5">
                      {ing.category}
                    </DialogDescription>
                  )}
                </DialogHeader>
                <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
                  {profileLoading && !profile && (
                    <p className="text-sm leading-relaxed text-muted-foreground italic">
                      Pulling the science together for your hair…
                    </p>
                  )}

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                      What it actually is
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/85">
                      {whatItIs || ing.body}
                    </p>
                  </div>




                  {benefits.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                        What it does in this formula
                      </p>
                      <ul className="space-y-1.5">
                        {benefits.map((b, i) => (
                          <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                            <span className="text-primary shrink-0 mt-0.5">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-lg bg-primary/8 border border-primary/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold mb-1.5">
                      What this means for your hair type
                    </p>
                    {profileLoading && !meansForYou && (
                      <p className="text-sm leading-relaxed text-muted-foreground italic">
                        Tailoring this to your hair…
                      </p>
                    )}
                    {meansForYou && (
                      <p className="text-sm leading-relaxed text-foreground/90">
                        {meansForYou}
                      </p>
                    )}
                    {!profileLoading && !meansForYou && profileError && (
                      <p className="text-sm leading-relaxed text-muted-foreground italic">
                        Personalised guidance unavailable right now.
                      </p>
                    )}
                  </div>

                  {isFlagged && (
                    <div className="rounded-lg bg-muted/40 border border-border/60 p-3">
                      <p className="text-[11px] leading-relaxed text-foreground/85">
                        <Flag
                          className="inline size-3 mr-1 fill-current align-[-1px]"
                          style={{ color: "hsl(40 65% 32%)" }}
                        />
                        In 3+ of your favourite shelf products.
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

export default IngredientDetail;
