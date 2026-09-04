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
import { alignFitLanguage } from "@/lib/fitBand";
import { looksSequential, splitNumberedSteps } from "@/lib/guidance";
import { condenseProse, wantsWhy, type GuidanceTip as GTip } from "@/lib/tipsRender";
import { BeginnerSteps } from "@/components/beginner/BeginnerGuide";
import {
  classifySurfactant,
  SURFACTANT_ROLE_LABEL,
  SURFACTANT_ROLE_NOTE,
} from "@/lib/surfactants";
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
import HomemadeSafetyCard from "@/components/product/HomemadeSafetyCard";
import GlossaryConfidenceCard from "@/components/product/GlossaryConfidenceCard";
import { parseRecipe, type HomemadeSafetyPayload } from "@/lib/homemade";
import { useProductPhotos } from "@/hooks/useProductPhotos";
import { useUserProducts } from "@/hooks/useUserProducts";
import { supabase } from "@/integrations/supabase/client";
import { saveProductRating, recomputeIngredientFlags, useIngredientLists } from "@/hooks/useIngredientLists";
import { useIngredientExplainer } from "@/hooks/useIngredientExplainer";
import { buildAiContext } from "@/lib/aiContext";
import { currentProfileHash, ingredientsFingerprint } from "@/lib/profileSnapshot";
import {
  decideProductAnalysis,
  assertAnalysisTrigger,
  type AnalysisTrigger,
} from "@/lib/analysisGate";

import { aiInvoke } from "@/lib/aiInvoke";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
import ScoreReasons, {
  parseScoreReasons,
  cautionReasonsHeading,
  formulationReasonsHeading,
  type ScoreReason,
} from "@/components/product/ScoreReasons";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";

import StrandTipNotes, { parseStrandTips, type StrandTipNote } from "@/components/product/StrandTipNotes";
import RelevanceNote from "@/components/product/RelevanceNote";
import PurposeInsight, { parsePurposeInsight, type ProductPurposeInsight } from "@/components/product/PurposeInsight";
import { cn } from "@/lib/utils";
import BrandLink from "@/components/BrandLink";
import MatchStars from "@/components/MatchStars";
import { starsFromScore, formatStars, normaliseMatchScore, matchScoreOf, verdictForStars, isScoreStale, scoreTone } from "@/lib/matchStars";
import SensitivityShelfAlert, { useTopicalAlert } from "@/components/sensitivity/SensitivityShelfAlert";
import { applySensitivityCeiling } from "@/lib/sensitivityCeiling";
import { safeProductSummary } from "@/lib/sensitivitySummary";

import AiProgressBar from "@/components/AiProgressBar";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

interface Ingredient {
  tone: "good" | "warn" | "bad";
  name: string;
  body: string;
  category?: string;
}
interface GuidanceTip { title: string; body: string }

// ── SINGLE-SCORE CUTOVER ─────────────────────────────────────────────────
// From this date, ingredient-analysis is the ONE scorer for a product and its
// result is persisted to user_products.match_score. Rows saved before it keep
// the score they already have — no backfill, no silent re-scoring of shelves
// members have already read.
const SINGLE_SCORE_CUTOVER = Date.parse("2026-08-28T00:00:00Z");
function isSingleScoreProduct(row: { created_at?: string | null } | null): boolean {
  const created = row?.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(created) && created >= SINGLE_SCORE_CUTOVER;
}

// REGENERATION IS GATED, NOT FLAGGED (2026-08-28, permanent). Opening a product
// can only ever spend a model call when `decideProductAnalysis` says so, and it
// can only say so for "nothing stored yet" or a real fingerprint change. See
// src/lib/analysisGate.ts and src/test/analysis_no_reanalyse.test.ts.


interface Analysis {

  /** null when the payload carried no score — never a made-up number. */
  match_score: number | null;

  score_reasons?: ScoreReason[];
  /** Mild observations shown separately, never part of the score. */
  strand_tip?: StrandTipNote[] | null;
  /** Purpose-match sentence — its own row, never score rationale. */
  relevance_note?: string | null;
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
  /** Homemade products only — standalone concentration-aware caution. */
  homemade_safety?: HomemadeSafetyPayload;
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
    // No ad-hoc fallback: a missing score stays missing rather than rendering
    // a fabricated 0 that reads as "terrible match".
    match_score: typeof fresh.match_score === "number" ? fresh.match_score : null,

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

  const { level: tipsLevel, showBeginnerHelp, ready: tipsLevelReady } = useTipsLevel();
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
  // SOURCE OF TRUTH: the stored `user_products.ingredients` column — exactly what
  // the shelf card's alert reads. Never the AI-regenerated `analysis.ingredients`
  // list: the model can reword, shorten or drop an INCI name, which silently hid
  // a declared sulphate match here while the shelf card flagged it correctly.
  // The analysis names are only a fallback for a fresh scan with no saved row.
  const inciNames = useMemo(() => {
    const stored = (productRow as { ingredients?: unknown } | null)?.ingredients;
    const rawStored = Array.isArray(stored)
      ? stored.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const fresh = Array.isArray(freshAnalysis?.ingredients)
      ? (freshAnalysis!.ingredients as unknown[]).filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        )
      : [];
    const fromAnalysis = (analysis?.ingredients ?? []).map((i) => i.name).filter(Boolean);
    return Array.from(new Set([...rawStored, ...fresh, ...fromAnalysis]));
  }, [productRow, freshAnalysis, analysis?.ingredients]);
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

  // Single source of truth: the explainer resolves "what it is" from the shared
  // glossary and "what this means for your hair" from THIS product's analysis
  // (Path 1). The old `ingredient-profile` generator is retired, so the popup
  // can no longer contradict the score card above it.
  const {
    explainer: ingredientExplainer,
    isLoading: explainerLoading,
    error: explainerError,
  } = useIngredientExplainer(selectedIngredient?.name ?? null, productRow?.id ?? null);


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
      const { data: userData } = await getDisplayedAuthUser();
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
      const { data: userData } = await getDisplayedAuthUser();
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
      const { data: userData } = await getDisplayedAuthUser();
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
    async (trigger: AnalysisTrigger, force = false) => {
      // Tripwire: a call site that reached here without a recognised trigger
      // bypassed the gate. Fail loudly rather than silently spending a call.
      assertAnalysisTrigger(trigger);

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
            /** Audit trail: why this call was allowed to happen at all. */
            trigger,

            // Catalogue ingredients for a product the member hasn't saved yet
            // (opened from a brand's shelf) — otherwise the model has to infer.
            // Prefer the stored INCI list so the model never has to infer a
            // formulation it can then get wrong (and so its sensitivity pass
            // runs on the same list every other surface reads).
            ingredients:
              (Array.isArray((row as { ingredients?: unknown } | null)?.ingredients)
                ? ((row as { ingredients?: unknown }).ingredients as string[])
                : undefined) ?? freshAnalysis?.ingredients ?? undefined,
            // EXPOSURE: where the label says this product goes, and whether it
            // stays on. Read off the pack at scan time and stored on the row —
            // the model must weigh an ingredient's risk against actual contact,
            // not guess the application area from the product name.
            category:
              (row as { category?: string | null } | null)?.category ?? null,
            applicationArea:
              (row as { application_area?: string | null } | null)?.application_area ?? null,
            leaveOn:
              (row as { leave_on?: boolean | null } | null)?.leave_on ?? null,
            usageInstructions:
              (row as { usage_instructions?: string | null } | null)?.usage_instructions
              ?? freshAnalysis?.usage_instructions ?? null,
            // Homemade recipes are analysed on their AMOUNTS, not just the
            // ingredient names — a commercial product is pre-formulated at safe
            // ratios, a kitchen mix is not.
            isHomemade: (row as { is_homemade?: boolean } | null)?.is_homemade === true,
            homemadeRecipe: parseRecipe((row as { homemade_recipe?: unknown } | null)?.homemade_recipe),
            hairProfile,
            healthProfile,
            heritage,
            context,
            force: force || stale,
          },
        );
        if (fnError) throw fnError;
        // Ingredients could not be read: the backend hard-blocks generation, so
        // show that plainly and never render an analysis for this product.
        if ((data as { ingredients_unreadable?: boolean } | null)?.ingredients_unreadable) {
          setAnalysis(null);
          setError(
            (data as { message?: string }).message ??
              "We couldn't read the ingredients for this product. Add them manually or try rescanning the label.",
          );
          setLoading(false);
          return;
        }
        if (data?.error) throw new Error(data.error);

        const fresh = data.analysis as Analysis;
        setAnalysis(fresh);

        // ONE SCORE PER PRODUCT. user_products.match_score is the single source
        // of truth every surface reads (cards, passport, PDFs, aiContext). Any
        // score this analysis produces is written into that column BEFORE it can
        // be rendered — this page never displays a number that isn't stored.
        //
        // Existing shelves are NOT re-scored: a row saved before the
        // single-score cutover keeps whatever score it already has. It still
        // gets its provenance stamped, so this analysis is served from storage
        // on every later open instead of being re-run on each visit.
        const freshScore = normaliseMatchScore(fresh?.match_score);
        if (row) {
          const takesFreshScore =
            freshScore != null
            && (row.match_score == null || isSingleScoreProduct(row));
          try {
            await supabase
              .from("user_products")
              .update({
                ...(takesFreshScore
                  ? {
                    match_score: freshScore,
                    match_score_computed_at: new Date().toISOString(),
                  }
                  : {}),
                // Stamp the provenance the cache gate below reads, so this
                // result is served from storage on every later open.
                analysis_generated_at: new Date().toISOString(),
                analysis_profile_snapshot_hash: currentProfileHash(context),
                analysis_ingredients_hash: ingredientsFingerprint(
                  (row as { ingredients?: unknown }).ingredients,
                ),
              })
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

  // ── CACHE GATE — opening a product NEVER calls the AI ────────────────────
  // A stored analysis is valid when the row carries one (score + generated_at),
  // its stored profile snapshot hash equals the current one, and its stored INCI
  // fingerprint equals the current one. When it is valid the saved payload is
  // read straight out of ai_summaries — a plain table read, no edge function
  // invocation, so no model call can happen — and rendered immediately.
  // Re-analysis happens only when that check fails, or when the member asks for
  // it explicitly ("Re-analyse").
  const ranForRef = useRef<string | null>(null);
  useEffect(() => {
    // Fresh-scan path: analysis is already in state, no need to re-fetch.
    if (freshAnalysis && !needsAnalysis) return;
    if (!productKey || !profileChecked) return;
    // GUIDANCE LEVEL MUST BE RESOLVED FIRST. The level is part of the cache
    // identity (`:L{n}` on the stored payload and `:tl{n}` on the profile
    // hash). On first render `useTipsLevel` returns the local default (2)
    // before the member's real level arrives from `profiles.tips_level`, so
    // running here looked up the WRONG level's cache, missed, and fired a
    // fresh analysis on every single page open. Wait for the server value.
    if (!tipsLevelReady) return;
    // Wait for the member's shelf to load before deciding the row is missing.
    // Without this guard the effect fired while `allProducts` was still
    // fetching, saw a null `savedRowRef.current`, concluded "no_saved_row"
    // and re-ran the model — burning a generation on every visit to a
    // product that already has a stored analysis.
    if (productsLoading) return;
    // Support level is part of the identity: guidance depth is level-specific,
    // so a level change looks for that level's stored analysis.
    const runKey = `${productKey}:L${tipsLevel}`;
    if (ranForRef.current === runKey) return;
    ranForRef.current = runKey;
    let cancelled = false;
    (async () => {
      const row = savedRowRef.current as
        | (typeof savedRowRef.current & {
            user_id?: string;
            analysis_generated_at?: string | null;
            analysis_profile_snapshot_hash?: string | null;
            analysis_ingredients_hash?: string | null;
          })
        | null;
      let reason = "";
      // HARD BLOCK (2026-08-28): a saved product with zero captured ingredients
      // is never given an analysis — not a fresh one, and not a stored one that
      // may name ingredients this product was never known to contain.
      const capturedIngredients = Array.isArray((row as { ingredients?: unknown } | null)?.ingredients)
        ? ((row as { ingredients?: unknown }).ingredients as unknown[]).filter(
            (x) => typeof x === "string" && x.trim().length > 0,
          )
        : [];
      if (row && capturedIngredients.length === 0 && (row as { is_homemade?: boolean }).is_homemade !== true) {
        setAnalysis(null);
        setError(
          "We couldn't read the ingredients for this product. Add them manually or try rescanning the label.",
        );
        setLoading(false);
        return;
      }
      // Read the stored payload for this level (homemade kinds carry a recipe
      // signature suffix, so match on the prefix), then fall back to any level:
      // the edge function downshifts a richer payload for a lower level, and a
      // level change is not a profile change, so it must never spend a call.
      // LOAD PATH (2026-09-03): both level lookups fire together. They used to
      // run in series, so a product whose payload was stored at another level
      // paid two full round trips before anything could render.
      const readStored = async (): Promise<Analysis | null> => {
        const [forLevel, anyLevel] = await Promise.all([
          supabase
            .from("ai_summaries")
            .select("payload")
            .like("kind", `ingredient_analysis:${productKey}:L${tipsLevel}%`)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("ai_summaries")
            .select("payload")
            .like("kind", `ingredient_analysis:${productKey}:%`)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (forLevel.data?.payload) return forLevel.data.payload as unknown as Analysis;
        return (anyLevel.data?.payload as unknown as Analysis) ?? null;
      };

      const storedPayload = row ? await readStored() : null;
      if (cancelled) return;

      // PAINT FIRST (2026-09-03). A stored payload is rendered the moment it is
      // read, BEFORE the profile fingerprint is computed. Computing that hash
      // needs the whole AI context (11 table reads plus the data-decrypt-context
      // invocation), which was costing tens of seconds on a result that was
      // already sitting in the database. The gate below is unchanged and still
      // decides everything — it just no longer holds up the paint. Nothing about
      // what the verdict says or how it is generated changes here.
      if (storedPayload) {
        setAnalysis(storedPayload);
        setError(null);
        setLoading(false);
      }

      // ── THE GATE ──────────────────────────────────────────────────────────
      // Pure decision, unit-tested in src/test/analysis_no_reanalyse.test.ts.
      // It can only ever return `generate` for "nothing stored" or a genuine
      // fingerprint change, so a second open of the same product on the same
      // profile is structurally incapable of spending a model call.
      const decision = decideProductAnalysis({
        hasSavedRow: !!row,
        capturedIngredientCount: capturedIngredients.length,
        isHomemade: (row as { is_homemade?: boolean } | null)?.is_homemade === true,
        storedScore: row ? matchScoreOf(row) : null,
        storedGeneratedAt: row?.analysis_generated_at ?? null,
        storedProfileHash: row?.analysis_profile_snapshot_hash ?? null,
        currentProfileHash: row?.analysis_profile_snapshot_hash
          ? currentProfileHash(await buildAiContext())
          : null,
        storedIngredientsHash: row?.analysis_ingredients_hash ?? null,
        currentIngredientsHash: row ? ingredientsFingerprint(row.ingredients) : null,
        storedPayloadFound: !!storedPayload,
      });
      if (cancelled) return;
      reason = decision.reason;
      console.log("[analysis-cache] decision", {
        product_key: productKey,
        decision: decision.action,
        reason,
      });

      if (decision.action === "blocked") {
        setAnalysis(null);
        setError(
          "We couldn't read the ingredients for this product. Add them manually or try rescanning the label.",
        );
        setLoading(false);
        return;
      }
      if (decision.action === "use_stored") {
        // Already painted above when a payload was found; this keeps the
        // no-payload-but-valid-row case behaving exactly as before.
        setAnalysis(storedPayload);
        setError(null);
        setLoading(false);
        return;
      }
      // Last-resort belt: even on `generate`, if anything is stored for this
      // product, it is already on screen — the fresh run replaces it when done.
      runAnalysis(decision.reason);

    })();
    return () => { cancelled = true; };
  }, [runAnalysis, productKey, freshAnalysis, needsAnalysis, profileChecked, tipsLevel, tipsLevelReady, productsLoading]);


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
          const { data: userData } = await getDisplayedAuthUser();
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
            {/* No manual re-analyse. The score is computed once and re-computed
                only when her hair characteristics, style, goals or challenges
                change (the profile fingerprint in the cache gate below). */}

          </div>

        </SurfaceCard>


        {loading && (
          <SurfaceCard className="space-y-2">
            <p className="font-body text-[12px] text-foreground/80">
              Analysing these ingredients for your profile
            </p>
            {/* HONEST TIMING (2026-09-03): measured from ai_call_log over the
                last 7 days, summed per generation (retries included):
                ingredient-analysis p50 25.3s, p75 49.8s, p90 80.9s. The old
                20s estimate meant the bar sat at 95% with an overrun note for
                most of a normal wait. 50s ≈ p75, so the bar tracks the real
                pipeline and the overrun note only fires on genuine tails. */}
            <AiProgressBar
              expectedMs={50000}
              overrunNote="Still working — a couple of the write-ups needed re-checking against the manuscript."
              stages={[
                "Reading the verified ingredient list",
                "Looking each ingredient up in the manuscript",
                "Matching the mechanisms to your profile",
                "Checking every claim against the guardrails",
                "Writing your breakdown",
              ]}
            />
          </SurfaceCard>
        )}


        {error && !loading && (
          error.startsWith("We couldn't read") ? (
            <SurfaceCard className="space-y-1">
              <p className="font-body text-[13px] text-foreground/80">{error}</p>
            </SurfaceCard>
          ) : (
            <SurfaceCard tone="orange" className="space-y-2">
              <p className="text-sm">Could not analyse this product.</p>
              <Button
                variant="goldGhost"
                size="pill"
                onClick={() => runAnalysis("member_requested", true)}
              >
                <RefreshCw className="size-4 mr-1" /> Retry
              </Button>
            </SurfaceCard>
          )
        )}



        {analysis && !loading && (
          <>
            {/* Homemade safety FIRST, and as its own card: a DIY hazard must
                never read as a footnote under an otherwise warm verdict. */}
            {analysis.homemade_safety && (
              <HomemadeSafetyCard safety={analysis.homemade_safety} />
            )}

            {/* Glossary coverage — physically separated from the safety card so a
                long subset of names can never read as the full recipe. */}
            {analysis.homemade_safety && (
              <GlossaryConfidenceCard
                unverified={analysis.homemade_safety.unverified ?? []}
                total={
                  (Array.isArray((productRow as { ingredients?: unknown } | null)?.ingredients)
                    ? ((productRow as { ingredients: string[] }).ingredients.length)
                    : 0) || (analysis.ingredients?.length ?? 0)
                }
              />
            )}

            {/* AI Summary — the single verdict callout, bold lead-in only */}

            {(() => {
              // SAFETY: when a declared sensitivity matches, the AI paragraph was
              // written against the pre-sensitivity score — any endorsement in it
              // is stripped so no positive claim can sit beside the avoid warning.
              // The verdict label above is derived from the score; prose that
              // calls the same product a different fit is a contradiction.
              const safeSummary = alignFitLanguage(
                safeProductSummary(analysis.summary, hasSensitivity),
                displayScore,
              );
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
                        <GlossaryRichText
                          text={`${phrase} `}
                          className={cn(
                            "font-semibold",
                            hasSensitivity ? "text-foreground/75" : "text-foreground",
                          )}
                        />
                      )}
                      <GlossaryRichText text={rest} className="text-foreground/75" />
                    </p>
                  )}

                  {(() => {
                    const reasons = parseScoreReasons(analysis.score_reasons);
                    // Safety net: if the guardrails cleared every line of
                    // prose, say so plainly rather than render an empty card.
                    if (!phrase && !rest && reasons.length === 0 && !hasSensitivity) {
                      return (
                        <p className="text-foreground/75">
                          We're still preparing the write-up for this one. Pull down to refresh, or
                          rescan the product to generate it again.
                        </p>
                      );
                    }
                    // Split the ranked drivers into two labelled sections so a
                    // low-scoring product leads with its cautions rather than
                    // praising it first. Each section keeps its own fresh
                    // numbering; neutral frequency observations keep their
                    // styling inside the shared ScoreReasons renderer.
                    const cautionReasons = reasons.filter((r) => r.direction === "minus");
                    const formulationReasons = reasons.filter((r) => r.direction === "plus");
                    return (
                      <>
                        {cautionReasons.length > 0 && (
                          <ScoreReasons
                            reasons={cautionReasons}
                            heading={cautionReasonsHeading()}
                          />
                        )}
                        {formulationReasons.length > 0 && (
                          <ScoreReasons
                            reasons={formulationReasons}
                            heading={formulationReasonsHeading()}
                          />
                        )}
                      </>
                    );
                  })()}

                </StatusCallout>

              );
            })()}

            {/* Mild, non-harmful observations — outside the score callout on
                purpose: food for thought, not score rationale. */}
            {/* Relevance is a separate axis from the rating: what the formula
                is aimed at, never a reason the score is what it is. */}
            <RelevanceNote note={analysis.relevance_note} />

            <StrandTipNotes tips={parseStrandTips(analysis.strand_tip)} />

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
                  {(() => {
                    const src = (productRow as { usage_instructions_source?: string | null } | null)
                      ?.usage_instructions_source ?? null;
                    const caption = src === "label_photo"
                      ? "Manufacturer's directions, read from the product label."
                      : src === "brand_page"
                        ? "Manufacturer's directions, published on the brand's own product page."
                        : null;
                    return caption
                      ? <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{caption}</p>
                      : null;
                  })()}
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

        {/* Start the next analysis — last block, under every other action. */}
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
            const profile = ingredientExplainer;
            // Product-specific verdict from the authoritative analysis; falls
            // back to the analysis row's own body so the copy always agrees.
            const meansForYou = profile?.fit?.for_you || ing.body || undefined;
            const notFlagged = !profile?.fit?.for_you && profile?.fit_note === "not_flagged";
            const whatItIs = profile?.glossary?.what_it_is ?? undefined;
            const roleInProduct = profile?.role_in_product ?? undefined;
            const profileLoading = explainerLoading;
            const profileError = Boolean(explainerError);

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
                        /* ingredient-explainer measured p50 2.6s / p90 3.0s. */
                        expectedMs={4000}
                        stages={[
                          "Looking this ingredient up",
                          "Reading the manuscript passage",
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
                    {roleInProduct && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                          What it does in this formula
                        </p>
                        <AiProse text={roleInProduct} />
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
                    {!profileLoading && !meansForYou && notFlagged && (
                      <p className="text-sm leading-relaxed text-foreground/80">
                        This one wasn't flagged either way in your analysis of this product —
                        nothing here counts for or against it on your profile.
                      </p>
                    )}
                    {!profileLoading && !meansForYou && !notFlagged && profileError && (
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
