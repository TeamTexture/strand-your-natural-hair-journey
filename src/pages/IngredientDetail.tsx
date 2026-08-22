import { Flag, RefreshCw, Trash2, Bookmark, ArrowDownToLine, ArrowUpFromLine, Heart, Sparkles } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import AiProse from "@/components/tips/AiProse";
import TipsBlock from "@/components/tips/TipsBlock";
import LevelGate from "@/components/tips/LevelGate";
import AnchorStat from "@/components/guidance/AnchorStat";
import StatusCallout from "@/components/guidance/StatusCallout";
import ActionList from "@/components/guidance/ActionList";
import StepSequence from "@/components/guidance/StepSequence";
import IngredientFlagRow from "@/components/product/IngredientFlagRow";
import { IngredientProductScope } from "@/components/ingredients/IngredientToken";
import { useIngredientIndex } from "@/hooks/useIngredientIndex";
import { emphasisSplit } from "@/lib/tipsRender";
import { looksSequential, splitNumberedSteps } from "@/lib/guidance";
import { condenseProse, wantsWhy, type GuidanceTip as GTip } from "@/lib/tipsRender";
import { BeginnerSteps } from "@/components/beginner/BeginnerGuide";
import {
  classifySurfactant,
  inferMarketedPurpose,
  isMarketedPurpose,
  MARKETED_PURPOSE_SURFACTANT_NOTE,
  MARKETED_PURPOSE_LABEL,
  SURFACTANT_ROLE_LABEL,
  SURFACTANT_ROLE_NOTE,
  type MarketedPurpose,
} from "@/lib/marketedPurpose";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import ProductPhotoTile from "@/components/ProductPhotoTile";
import ProductThumb from "@/components/ProductThumb";
import OffShelfReasonSheet from "@/components/OffShelfReasonSheet";
import AnalyseAnotherCard from "@/components/product/AnalyseAnotherCard";
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
import { safeBack } from "@/lib/smartBack";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useProductPhotos } from "@/hooks/useProductPhotos";
import { useUserProducts } from "@/hooks/useUserProducts";
import { supabase } from "@/integrations/supabase/client";
import { saveProductRating, recomputeIngredientFlags, useIngredientLists } from "@/hooks/useIngredientLists";
import { useIngredientProfile } from "@/hooks/useIngredientProfile";
import { buildAiContext } from "@/lib/aiContext";
import { aiInvoke } from "@/lib/aiInvoke";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
import ScoreReasons, { parseScoreReasons, type ScoreReason } from "@/components/product/ScoreReasons";
import PurposeInsight, { parsePurposeInsight, type ProductPurposeInsight } from "@/components/product/PurposeInsight";
import { cn } from "@/lib/utils";
import BrandLink from "@/components/BrandLink";
import MatchStars from "@/components/MatchStars";
import { starsFromScore, formatStars, normaliseMatchScore, matchScoreOf, verdictForStars, isScoreStale, scoreTone } from "@/lib/matchStars";
import SensitivityShelfAlert, { useTopicalAlert } from "@/components/sensitivity/SensitivityShelfAlert";
import { applySensitivityCeiling } from "@/lib/sensitivityCeiling";
import { safeProductSummary } from "@/lib/sensitivitySummary";

import AiProgressBar from "@/components/AiProgressBar";

interface Ingredient {
  tone: "good" | "warn" | "bad";
  name: string;
  body: string;
  category?: string;
}
interface GuidanceTip { title: string; body: string }
interface Analysis {
  match_score: number;
  score_reasons?: ScoreReason[];
  insight?: ProductPurposeInsight | null;
  summary: string;
  ingredients: Ingredient[];
  personalised_guidance?: GuidanceTip[];
  // Fresh-scan extras (from product-analyse, optional for cached path):
  usage_instructions?: string;
  use_cases?: string[];
  tips?: string[];
  pair_with?: Array<{ item: string; why: string }>;
  routine_suggestion?: string;
}

// Shape returned by the product-analyse edge function (passed via route state
// from ProductScanning). Only the fields we actually consume are typed here.
interface FreshAnalysisPayload {
  product_name?: string;
  brand?: string;
  ingredients?: string[];
  key_ingredients?: Array<{ name: string; benefit?: string; flag?: "good" | "warn" | "avoid"; reason?: string }>;
  match_score?: number;
  score_reasons?: unknown;
  insight?: unknown;
  ai_summary?: string;
  usage_instructions?: string;
  use_cases?: string[];
  tips?: string[];
  pair_with?: Array<{ item: string; why: string }>;
  routine_suggestion?: string;
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
    score_reasons: parseScoreReasons(fresh.score_reasons),
    insight: parsePurposeInsight(fresh.insight),
    summary: fresh.ai_summary ?? "",
    ingredients,
    usage_instructions: fresh.usage_instructions,
    use_cases: fresh.use_cases,
    tips: fresh.tips,
    pair_with: fresh.pair_with,
    routine_suggestion: fresh.routine_suggestion,
  };
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
    /** Set when opened from a brand's shelf (see BrandShelfProductOpen). */
    brand_product_id?: string;
    external_url?: string | null;
    /** Seed payload only — run the member's own analysis on top of it. */
    needs_analysis?: boolean;
  } | null;
  const freshAnalysis = navState?.analysis ?? null;
  const needsAnalysis = navState?.needs_analysis ?? false;
  const navIntent: "shelf" | "wishlist" = navState?.intent ?? "shelf";
  const autoSave = navState?.auto_save ?? false;
  const returnTo = navState?.returnTo ?? null;
  const brandProductId = navState?.brand_product_id ?? null;
  const brandBuyUrl = navState?.external_url ?? null;
  const isJournalReturn = !!returnTo?.startsWith("/journal/entry/");

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
  // Kept in a ref so the analysis callback can write its score back to the
  // saved row without re-creating itself (and re-running the AI call).
  const savedRowRef = useRef(productRow);
  useIngredientIndex(productRow);
  savedRowRef.current = productRow;

  const { level: tipsLevel, showBeginnerHelp } = useTipsLevel();
  const [showAllIngredients, setShowAllIngredients] = useState(false);


  const returnAfterAutoSave = useCallback(
    (productId: string | null | undefined) => {
      if (!returnTo) return;
      navigate(returnTo, {
        replace: true,
        state: isJournalReturn && productId ? { journalAddProductId: productId } : undefined,
      });
    },
    [isJournalReturn, navigate, returnTo],
  );

  // Initial loading state: only show the spinner when we have no fresh
  // analysis to render immediately.
  const [loading, setLoading] = useState(!freshAnalysis || needsAnalysis);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(
    freshAnalysis && !needsAnalysis ? freshToAnalysis(freshAnalysis) : null,
  );
  // THE score for this page. Always the stored column via the shared accessor,
  // so this page can never show a number that differs from the product card,
  // the passport or any AI context. The analysis payload is only used for a
  // product that has no saved row yet (a fresh scan awaiting save) — once it is
  // saved, runAnalysis persists the score and this resolves to the column.
  const storedScore = useMemo(
    () => matchScoreOf(productRow) ?? normaliseMatchScore(analysis?.match_score),
    [productRow, analysis?.match_score],
  );
  // SAFETY: the same deterministic, zero-cost topical match the shelf card runs.
  // A stored score computed BEFORE the member declared a sensitivity must never
  // be shown as-is here — the card and this page read one ceiling, one matcher.
  const inciNames = useMemo(
    () => (analysis?.ingredients ?? []).map((i) => i.name).filter(Boolean),
    [analysis?.ingredients],
  );
  const sensitivityHits = useTopicalAlert(inciNames);
  const hasSensitivity = sensitivityHits.length > 0;
  const sensitivityLabels = sensitivityHits.map((h) => h.entry.label).join(", ");
  const displayScore = applySensitivityCeiling(storedScore, sensitivityHits.length);
  const displayStars = starsFromScore(displayScore);
  // Positive framing must never appear above a contradicting warning.
  const displayVerdict =
    displayStars == null
      ? null
      : hasSensitivity
      ? `Best avoided — contains ${sensitivityLabels}, which you avoid`
      : verdictForStars(displayStars);
  const [savingToShelf, setSavingToShelf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offShelfOpen, setOffShelfOpen] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [tipsExpanded, setTipsExpanded] = useState(false);

  // Marketed purpose — what the product is SOLD for. The AI works this out
  // automatically from the scan/title/claims + the INCI list; the user is not
  // asked to classify it manually.
  const [purpose, setPurpose] = useState<MarketedPurpose | null>(null);

  const detected = (freshAnalysis ?? analysis) as
    | { marketed_purpose?: unknown; marketed_purpose_note?: unknown; marketed_purpose_confidence?: unknown }
    | null;
  const purposeNote =
    typeof detected?.marketed_purpose_note === "string" && detected.marketed_purpose_note.trim()
      ? detected.marketed_purpose_note.trim()
      : null;
  const purposeLowConfidence = detected?.marketed_purpose_confidence === "low";

  useEffect(() => {
    const stored = (productRow as { marketed_purpose?: unknown } | null)?.marketed_purpose;
    if (isMarketedPurpose(stored)) {
      setPurpose(stored);
      return;
    }
    const fromScan = (freshAnalysis as { marketed_purpose?: unknown } | null)?.marketed_purpose;
    if (isMarketedPurpose(fromScan)) {
      setPurpose(fromScan);
      return;
    }
    const titleFirstText = [
      productName,
      (freshAnalysis as { product_name?: unknown } | null)?.product_name,
      productRow?.name,
      productBrand,
      productRow?.brand,
      analysis?.summary,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" ");
    setPurpose(
      inferMarketedPurpose(titleFirstText) ?? "general_all_hair_types",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRow?.id, productRow?.name, productRow?.brand, productName, productBrand, analysis?.summary, freshAnalysis]);

  // ONE purpose-driven insight, generated by the AI (purpose → ingredient
  // emphasis → her hair → implication → how to use). Replaces the old
  // generic explanatory copy entirely.
  const purposeInsight = useMemo<ProductPurposeInsight | null>(
    () =>
      analysis?.insight ??
      parsePurposeInsight((freshAnalysis as { insight?: unknown } | null)?.insight),
    [analysis?.insight, freshAnalysis],
  );

  // Persist what the AI detected so later analyses reuse it — silently.
  useEffect(() => {
    if (!purpose || !productRow?.id) return;
    if ((productRow as { marketed_purpose?: unknown }).marketed_purpose === purpose) return;
    void supabase
      .from("user_products")
      .update({ marketed_purpose: purpose })
      .eq("id", productRow.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, productRow?.id]);

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

  // For the ingredient popup: index the user's shelf/wishlist products by
  // lowercased ingredient name. Excludes the current product so the dialog can
  // show where else this ingredient appears.
  const productsByIngredient = useMemo(() => {
    const map = new Map<string, Array<{
      id: string;
      key: string;
      name: string;
      brand: string | null;
      imageUrl: string | null;
      storagePath: string | null;
      onShelf: boolean;
      onWishlist: boolean;
    }>>();
    for (const p of allProducts) {
      if (p.product_key === productKey) continue;
      if (!p.on_shelf && !p.on_wishlist) continue;
      for (const ing of p.ingredients ?? []) {
        const k = ing.toLowerCase().trim();
        if (!k) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push({
          id: p.id,
          key: p.product_key,
          name: p.name,
          brand: p.brand,
          imageUrl: p.image_url ?? null,
          storagePath: p.storage_path ?? null,
          onShelf: !!p.on_shelf,
          onWishlist: !!p.on_wishlist,
        });
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

  // When the user's hair profile changed after a score was computed, that
  // score no longer describes their hair and must be recomputed.
  // Held in a ref, not a dependency: when this resolved into `runAnalysis`'s
  // dependency list it re-created the callback and fired a SECOND identical
  // analysis request on every mount.
  const hairProfileUpdatedRef = useRef<string | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (!cancelled) setProfileChecked(true);
        return;
      }
      const { data } = await supabase
        .from("user_hair_profile")
        .select("updated_at")
        .eq("user_id", uid)
        .maybeSingle();
      if (!cancelled) {
        hairProfileUpdatedRef.current = (data?.updated_at as string | null) ?? null;
        setProfileChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  const runAnalysis = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const clinical = await loadClinicalContext();
        const hairProfile = clinical.hair ?? {};
        const healthProfile = clinical.health ?? {};
        const heritage = clinical.basic?.heritage ?? [];

        const row = savedRowRef.current;
        // Re-score only when there is no stored score or the stored one predates
        // the user's latest hair-profile edit. Otherwise this call is for the
        // ingredient flags and guidance, and the stored score stands.
        const stale = isScoreStale(row, hairProfileUpdatedRef.current);

        const context = await buildAiContext();
        const { data, error: fnError } = await aiInvoke<Record<string, any>>(
          "ingredient-analysis",
          {
            productKey,
            productName,
            productBrand,
            // Catalogue ingredients for a product the member hasn't saved yet
            // (opened from a brand's shelf) — otherwise the model has to infer.
            ingredients: freshAnalysis?.ingredients ?? undefined,
            hairProfile,
            healthProfile,
            heritage,
            context,
            force: force || stale,
          },
        );
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const fresh = data.analysis as Analysis;
        setAnalysis(fresh);

        // ONE SCORE PER PRODUCT. user_products.match_score is the single source
        // of truth every surface reads (cards, passport, PDFs, aiContext). Any
        // score this analysis produces is written into that column BEFORE it can
        // be rendered — this page never displays a number that isn't stored.
        const freshScore = normaliseMatchScore(fresh?.match_score);
        const needsWrite = row && freshScore != null && (stale || force || row.match_score !== freshScore);
        if (needsWrite) {
          try {
            await supabase
              .from("user_products")
              .update({ match_score: freshScore, match_score_computed_at: new Date().toISOString() })
              .eq("id", row.id);
            await reload();
            window.dispatchEvent(new CustomEvent("user-products-updated"));
          } catch (syncErr) {
            console.warn("match_score write-back failed", syncErr);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not analyse this product.";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [productKey, productName, productBrand, freshAnalysis, reload],
  );

  // One analysis request per product, once the profile check has resolved.
  const ranForRef = useRef<string | null>(null);
  useEffect(() => {
    // Fresh-scan path: analysis is already in state, no need to re-fetch.
    if (freshAnalysis && !needsAnalysis) return;
    if (!productKey || !profileChecked) return;
    // Support level is part of the identity: guidance depth is level-specific,
    // so changing level re-runs the analysis instead of showing stale depth.
    const runKey = `${productKey}:L${tipsLevel}`;
    if (ranForRef.current === runKey) return;
    ranForRef.current = runKey;
    runAnalysis(false);
  }, [runAnalysis, productKey, freshAnalysis, needsAnalysis, profileChecked, tipsLevel]);

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
          // Opened from a brand's shelf: record the catalogue link and mark the
          // ingredient list as the brand's own, not an OCR guess.
          ...(brandProductId
            ? { linked_brand_product_id: brandProductId, ingredients_source: "brand", source_url: brandBuyUrl }
            : {}),
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
              kind: `product_analyse:v2-manuscript-2026-08-09:${productKey}`,
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
    [freshAnalysis, productKey, productName, productBrand, navState?.storage_path, brandProductId, brandBuyUrl, upsert],
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
        returnAfterAutoSave(saved.id);
      }
    })();
  }, [freshAnalysis, autoSave, navIntent, returnTo, persistFreshScan, returnAfterAutoSave, autoSaveDoneRef]);

  // Existing-product auto-save path (for links/products already analysed):
  // send the user back to the journal and pass the saved row id so it is
  // selected immediately instead of making them pick it again.
  const existingAutoSaveDoneRef = useRef(false);
  useEffect(() => {
    if (!autoSave || freshAnalysis || !productRow || !returnTo || existingAutoSaveDoneRef.current) return;
    existingAutoSaveDoneRef.current = true;
    (async () => {
      if (navIntent === "shelf" && !productRow.on_shelf) {
        await setShelf(productRow.id, true);
      } else if (navIntent === "wishlist" && !productRow.on_wishlist) {
        await setWishlist(productRow.id, true);
      }
      returnAfterAutoSave(productRow.id);
    })();
  }, [autoSave, freshAnalysis, navIntent, productRow, returnAfterAutoSave, returnTo, setShelf, setWishlist]);

  const handleSaveFreshTo = async (intent: "shelf" | "wishlist") => {
    const saved = await persistFreshScan(intent);
    if (saved) {
      ctaChosenRef.current = true;
      toast.success(
        intent === "shelf"
          ? `${saved.name} added to your shelf`
          : `${saved.name} added to your wishlist`,
      );
      // Came here from somewhere specific (a style-record step, a wash-day
      // step…) — return to that exact page, not the products list.
      if (returnTo) returnAfterAutoSave(saved.id);
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
      ctaChosenRef.current = true;
      toast.success(`${productRow.name} added to your shelf`);
      if (returnTo) {
        returnAfterAutoSave(productRow.id);
        return;
      }
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
      ctaChosenRef.current = true;
      toast.success(`${productRow.name} added to your wishlist`);
      if (returnTo) {
        returnAfterAutoSave(productRow.id);
        return;
      }
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

  // Send the user back to whichever page they came from before opening
  // this product (Shelf, Wishlist, Off-shelf, Favourites, brand page, etc.)
  // rather than defaulting them to Shelf.
  const goBackToOrigin = () => {
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }
    safeBack(navigate, "/products");
  };

  const handleConfirmDelete = async () => {
    if (!productRow) return;
    setShelfBusy(true);
    try {
      await remove(productRow.id);
      ctaChosenRef.current = true;
      toast.success("Product removed");
      goBackToOrigin();
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
      navigate("/products", { replace: true });
    }
  };

  const handleCancelDiscard = () => {
    setDiscardOpen(false);
    pendingNavRef.current = null;
  };

  const handleBack = () => {
    if (shouldGuard) {
      pendingNavRef.current = () => {
        goBackToOrigin();
      };
      setDiscardOpen(true);
      return;
    }
    // Back always returns to the page the member came from — the style-record
    // step, wash-day step, shelf or brand page. Only when there's no origin at
    // all (deep link / reload) do we fall back to the products list.
    goBackToOrigin();
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
    <IngredientProductScope productId={productRow?.id ?? null}>
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

        {/* SAFETY: same red strip as the shelf card, above anything that could
            read as a positive verdict. Renders nothing when there's no match. */}
        <SensitivityShelfAlert ingredients={inciNames} className="rounded-xl" />

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
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Rating</p>
            {(() => {
              if (!analysis) {
                return (
                  <p className="text-xs text-muted-foreground italic">
                    {loading ? "Calculating…" : "Awaiting analysis"}
                  </p>
                );
              }
              if (displayStars == null) {
                return <p className="text-xs text-muted-foreground italic">Awaiting analysis</p>;
              }
              return (
                <div className="flex items-center justify-between gap-3">
                  <MatchStars score={displayScore} size="lg" showValue={false} />
                  <p
                    className={cn(
                      "text-[11px] text-right max-w-[160px] leading-tight",
                      hasSensitivity ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {displayVerdict}
                  </p>
                </div>
              );
            })()}
          </div>

        </SurfaceCard>


        {loading && (
          <SurfaceCard className="space-y-2">
            <p className="font-body text-[12px] text-foreground/80">
              Analysing these ingredients for your profile
            </p>
            <AiProgressBar
              expectedMs={20000}
              stages={[
                "Reading the ingredient list",
                "Matching against your hair profile",
                "Looking these up in the manuscript",
                "Writing your analysis",
              ]}
            />
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
            {/* AI Summary — the single verdict callout, bold lead-in only */}
            {(() => {
              // SAFETY: when a declared sensitivity matches, the AI paragraph was
              // written against the pre-sensitivity score — any endorsement in it
              // is stripped so no positive claim can sit beside the avoid warning.
              const safeSummary = safeProductSummary(analysis.summary, hasSensitivity);
              const { phrase, rest } = emphasisSplit(safeSummary);
              // A declared sensitivity overrides the tone outright: the callout
              // can never read green above a warning that contradicts it.
              const vTone: "good" | "gold" | "warning" = hasSensitivity
                ? "warning"
                : scoreTone(displayScore ?? 0);
              return (
                <StatusCallout tone={vTone} label="Verdict">
                  {displayScore != null && displayScore > 0 && (
                    <AnchorStat value={displayScore} context="hair-profile match" tone={vTone} className="mt-0 mb-2" />
                  )}
                  {hasSensitivity && (
                    <p className="mb-2 font-semibold text-destructive">
                      Contains {sensitivityLabels} — an ingredient you've told us to avoid
                      completely. Always check the pack before you use it.
                    </p>
                  )}
                  {(phrase || rest) && (
                    <p className={hasSensitivity ? "text-foreground/75" : undefined}>
                      {phrase && (
                        <span
                          className={cn(
                            "font-semibold",
                            hasSensitivity ? "text-foreground/75" : "text-foreground",
                          )}
                        >
                          {phrase}{" "}
                        </span>
                      )}
                      <span className="text-foreground/75">{rest}</span>
                    </p>
                  )}

                  <ScoreReasons reasons={parseScoreReasons(analysis.score_reasons)} />
                </StatusCallout>
              );
            })()}

            {/* Personalised "How to use this for your hair" */}
            {analysis.personalised_guidance && analysis.personalised_guidance.length > 0 && (
              <LevelGate min={1}>
                <SectionLabel>How to use this for your hair</SectionLabel>
                <SurfaceCard>
                  {/* The body IS the guidance — it is shown at every support
                      level; only the number of tips scales with the level. */}
                  <ActionList
                    idPrefix="pg"
                    showWhy
                    actions={analysis.personalised_guidance
                      .slice(0, tipsLevel === 1 ? 1 : tipsLevel === 2 ? 3 : 6)
                      .map((tip) => ({ action: tip.title, why: tip.body }))}
                  />
                </SurfaceCard>
              </LevelGate>
            )}


            <SectionLabel>Ingredients</SectionLabel>
            {tipsLevel >= 2 && (
              <p key={`ing-note-${tipsLevel}`} className="px-1 -mt-1 mb-2 text-[11px] text-muted-foreground italic leading-snug animate-in fade-in-0 duration-300">
                {tipsLevel === 2
                  ? "Tap any ingredient to see what it does. A flag marks ones that show up across your shelf."
                  : "Every ingredient in this formulation. Tap a bubble to learn what it is, what category it falls under, and how it's used in this product. A small flag marks ingredients that appear in 3+ of the products you've put on your shelf, favourited, and actually used."}
              </p>
            )}
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
                // Lower support levels keep the list short: flagged ingredients
                // first, then the head of the list, with an opt-in for the rest.
                const cap = tipsLevel === 1 ? 6 : tipsLevel === 2 ? 10 : all.length;
                const ranked = cap >= all.length
                  ? all
                  : [
                      ...all.filter((i) => flaggedNames.has(i.name.toLowerCase().trim())),
                      ...all.filter((i) => !flaggedNames.has(i.name.toLowerCase().trim())),
                    ];
                const shown = showAllIngredients ? all : ranked.slice(0, cap);
                const hidden = all.length - shown.length;
                return (
                  <>
                    <div key={`ing-${tipsLevel}-${showAllIngredients}`} className="flex flex-wrap gap-1.5 animate-in fade-in-0 duration-300">
                      {shown.map((i, idx) => {
                        const lower = i.name.toLowerCase().trim();
                        const isFlagged = flaggedNames.has(lower);
                        return (
                          <button
                            key={`${i.name}-${idx}`}
                            type="button"
                            onClick={() => setSelectedIngredient(i)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-medium leading-tight hover:bg-primary/90 active:scale-[0.97] transition"
                          >
                            {isFlagged && (
                              <Flag
                                className="size-3 shrink-0 fill-current text-primary"
                                aria-label="flagged ingredient"
                              />
                            )}
                            <span className="truncate max-w-[180px]">{i.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {hidden > 0 && !showAllIngredients && (
                      <button
                        type="button"
                        onClick={() => setShowAllIngredients(true)}
                        className="mt-3 text-[11px] font-medium text-primary underline underline-offset-2"
                      >
                        Show all {all.length} ingredients
                      </button>
                    )}
                  </>
                );
              })()}
            </div>


            {/* Standard "How to use it" intentionally removed — only the
                personalised guidance/tips below are shown. */}



            {/* "What this means for your hair" section removed — too much
                explanatory copy on this page. */}




            {analysis.use_cases && analysis.use_cases.length > 0 && (
              <LevelGate min={2}>
                <SectionLabel>Getting the most from this for your hair type</SectionLabel>
                <SurfaceCard>
                  <ActionList idPrefix="uc" actions={analysis.use_cases.map((t) => ({ action: t }))} showWhy={false} />
                </SurfaceCard>
              </LevelGate>
            )}

            {analysis.usage_instructions && (
              <LevelGate min={2}>
                <SectionLabel>How to use it</SectionLabel>
                <SurfaceCard>
                  {looksSequential(analysis.usage_instructions) ? (
                    <StepSequence steps={splitNumberedSteps(analysis.usage_instructions).map((text) => ({ text }))} />
                  ) : (
                    <AiProse text={analysis.usage_instructions} />
                  )}
                </SurfaceCard>
              </LevelGate>
            )}

            {analysis.tips && analysis.tips.length > 0 && (
              <>
                <SectionLabel>Personalised tips</SectionLabel>
                <SurfaceCard>
                  <ActionList idPrefix="pt" actions={analysis.tips.map((t) => ({ action: t }))} showWhy={false} />
                  <TipsLevelPrompt className="mt-1" />
                </SurfaceCard>
              </>
            )}

            {analysis.pair_with && analysis.pair_with.length > 0 && (
              <LevelGate min={2}>
                <SectionLabel>Pair with (from your shelf)</SectionLabel>
                <SurfaceCard className="space-y-2">
                  {(tipsLevel === 2 ? analysis.pair_with.slice(0, 2) : analysis.pair_with).map((p, idx) => (
                    <div key={`pair-${idx}`} className="flex items-start gap-2">
                      <span className="text-primary shrink-0 mt-1">•</span>
                      <p className="text-sm leading-relaxed text-foreground/85">
                        <span className="font-medium">{p.item}</span>
                        {p.why && tipsLevel >= 3 ? <span className="text-foreground/70"> — {p.why}</span> : null}
                      </p>
                    </div>
                  ))}
                </SurfaceCard>
              </LevelGate>
            )}

            {analysis.routine_suggestion && (
              <LevelGate min={2}>
                <SectionLabel>Slot into your routine</SectionLabel>
                <SurfaceCard>
                  <AiProse text={analysis.routine_suggestion} className="text-sm" />
                </SurfaceCard>
              </LevelGate>
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
            {brandBuyUrl && (
              <a
                href={brandBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[12px] font-body text-primary py-1"
              >
                Buy it from the brand
              </a>
            )}
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

        {/* Start the next analysis without leaving this page. */}
        <AnalyseAnotherCard returnTo={returnTo} />

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
            const alsoInProducts = productsByIngredient.get(lower) ?? [];
            const shelfMatches = alsoInProducts.filter((p) => p.onShelf);
            const wishlistMatches = alsoInProducts.filter((p) => !p.onShelf && p.onWishlist);
            const renderProductMatch = (p: (typeof alsoInProducts)[number]) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedIngredient(null);
                  navigate(`/products/profile/${p.id}`);
                }}
                className="w-full rounded-lg border border-border/60 bg-background/60 p-2.5 flex items-start gap-2.5 text-left hover:bg-primary/5 transition-colors"
              >
                <ProductThumb
                  imageUrl={p.imageUrl}
                  storagePath={p.storagePath}
                  alt={p.name}
                  wrapperClassName="size-10 rounded-md overflow-hidden bg-primary/10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug break-words">{p.name}</p>
                  {p.brand && (
                    <p className="text-[11px] text-muted-foreground break-words"><BrandLink brand={p.brand} /></p>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-[0.12em] text-primary shrink-0 mt-0.5">
                  Review
                </span>
              </button>
            );
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-lg leading-tight flex items-start gap-2">
                    {isFlagged && (
                      <Flag
                        className="size-4 mt-1 shrink-0 fill-current text-primary"
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
                    <div className="space-y-2">
                      <p className="text-sm leading-relaxed text-muted-foreground italic">
                        Pulling the science together for your hair…
                      </p>
                      <AiProgressBar
                        compact
                        expectedMs={14000}
                        stages={[
                          "Looking this ingredient up",
                          "Checking the manuscript",
                          "Tailoring it to your hair",
                        ]}
                      />
                    </div>
                  )}


                  {(() => {
                    const role = classifySurfactant(ing.name);
                    if (role === "none") return null;
                    return (
                      <div className="rounded-[10px] border border-primary/25 bg-primary/5 p-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold mb-1">
                          {SURFACTANT_ROLE_LABEL[role]}
                        </p>
                        <AiProse text={SURFACTANT_ROLE_NOTE[role]} />
                        {purpose && (
                          <div className="mt-1.5">
                            <AiProse text={MARKETED_PURPOSE_SURFACTANT_NOTE[purpose]} />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                      What this is
                    </p>
                    <AiProse text={whatItIs || ing.body} />
                  </div>

                  <LevelGate min={3}>
                    {benefits.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                          What it does in this formula
                        </p>
                        {showBeginnerHelp ? (
                          <BeginnerSteps steps={benefits.map((b) => ({ text: b }))} />
                        ) : (
                          <ul className="space-y-1.5">
                            {benefits.map((b, i) => (
                              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                                <span className="text-primary shrink-0 mt-0.5">•</span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </LevelGate>

                  {/* Kept on the ingredient popup — this is the read members
                   *  come here for. Succinct card, one short prose block. */}
                  <div className="rounded-lg bg-primary/8 border border-primary/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold mb-1.5">
                      What this means for your hair
                    </p>
                    {profileLoading && !meansForYou && (
                      <p className="text-sm leading-relaxed text-muted-foreground italic">
                        Tailoring this to your hair…
                      </p>
                    )}
                    {meansForYou && <AiProse text={meansForYou} />}
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
                          className="inline size-3 mr-1 fill-current align-[-1px] text-primary"
                        />
                        In 3+ of your favourite shelf products.
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg bg-muted/35 border border-border/60 p-3 space-y-2.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold">
                        Also in your products
                      </p>
                      <LevelGate min={2}>
                        <AiProse
                          className="mt-1"
                          text={alsoInProducts.length > 0
                            ? "Other shelf or wishlist products that include this ingredient. At guided levels, use this to spot repeated exposure across your routine."
                            : "No other shelf or wishlist products include this ingredient yet. If you add more products later, STRAND will show repeats here."
                          }
                        />
                      </LevelGate>
                    </div>

                    {shelfMatches.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          On your shelf
                        </p>
                        {shelfMatches.map(renderProductMatch)}
                      </div>
                    )}

                    {wishlistMatches.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          On your wishlist
                        </p>
                        {wishlistMatches.map(renderProductMatch)}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={(o) => !o && handleCancelDiscard()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving without saving will discard this analysis. You'll need to re-scan to see it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDiscard}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDiscard}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
    </IngredientProductScope>
  );
};

export default IngredientDetail;
