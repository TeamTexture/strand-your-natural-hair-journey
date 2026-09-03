import { safeBack } from "@/lib/smartBack";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash2, ArrowDownToLine } from "lucide-react";
import OffShelfReasonSheet from "@/components/OffShelfReasonSheet";
import ProductThumb from "@/components/ProductThumb";
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
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useIngredientLists } from "@/hooks/useIngredientLists";
import { useGoals } from "@/hooks/useGoals";
import { supabase } from "@/integrations/supabase/client";
import { allChallenges, challengesOf } from "@/lib/goalChallenges";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import MatchStars from "@/components/MatchStars";
import { matchScoreOf, scoreTone as toneForScore } from "@/lib/matchStars";
import ScoreReasons, { parseScoreReasons, scoreReasonsHeading, type ScoreReason } from "@/components/product/ScoreReasons";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";

import StrandTipNotes, { parseStrandTips, type StrandTipNote } from "@/components/product/StrandTipNotes";
import RelevanceNote, { parseRelevanceNote } from "@/components/product/RelevanceNote";
import { alignFitLanguage } from "@/lib/fitBand";
import { buildAiContext } from "@/lib/aiContext";
import { aiInvoke } from "@/lib/aiInvoke";
import { decideProductAnalysis, assertAnalysisTrigger } from "@/lib/analysisGate";

import BrandLink from "@/components/BrandLink";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { condenseProse, emphasisSplit } from "@/lib/tipsRender";
import AnchorStat from "@/components/guidance/AnchorStat";
import StatusCallout from "@/components/guidance/StatusCallout";
import IngredientFlagRow from "@/components/product/IngredientFlagRow";
import SensitivityWarning from "@/components/sensitivity/SensitivityWarning";
import { useSensitivities } from "@/hooks/useSensitivities";
import { scanSensitivities } from "@/lib/sensitivityMatch";
import { applySensitivityCeiling } from "@/lib/sensitivityCeiling";
import { IngredientProductScope, GlossaryLabel } from "@/components/ingredients/IngredientToken";
import { useIngredientIndex } from "@/hooks/useIngredientIndex";
import { Sparkles } from "lucide-react";

/** Per-ingredient flag returned by the ingredient-analysis edge function. */
// Regeneration on this page is gated by the same rule as the detail page: the
// stored analysis on the row is rendered whenever one exists, and the only way
// to reach a fresh call is having nothing stored at all.


interface IngredientFlag {

  name: string;
  tone: "good" | "warn" | "bad";
  body: string;
  /** Server-set when the ingredient matches a declared topical sensitivity. */
  sensitivity?: boolean;
}

interface IngredientAnalysisResponse {
  error?: string;
  analysis?: {
    ingredients?: IngredientFlag[];
    summary?: string;
    match_score?: number;
    score_reasons?: unknown;
    strand_tip?: unknown;
    relevance_note?: unknown;

  };
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
  const { level: tipsLevel } = useTipsLevel();
  const { id } = useParams<{ id: string }>();
  const { user, isViewingAs } = useAuth();
  const { allProducts, loading, setShelf, setWishlist, remove, reload } = useUserProducts("all");
  const { washDays } = useWashDays();
  const { flags } = useIngredientLists();
  const { goals } = useGoals();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offShelfOpen, setOffShelfOpen] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [expandedIngredient, setExpandedIngredient] = useState<string | null>(null);

  // Per-ingredient AI flags (good/warn/bad + body) for THIS product, scored
  // against the user's full profile (hair, health, goals, current style).
  const [aiFlags, setAiFlags] = useState<IngredientFlag[]>([]);
  // Live topical sensitivity list — matched in the browser so even a cached
  // analysis row shows the "sensitivity" tag straight away.
  const { entriesFor } = useSensitivities();
  const topicalEntries = entriesFor("topical");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiMatchScore, setAiMatchScore] = useState<number | null>(null);
  const [aiScoreReasons, setAiScoreReasons] = useState<ScoreReason[]>([]);
  // Fit-first: mild, non-harmful observations render here, never as score rationale.
  const [strandTips, setStrandTips] = useState<StrandTipNote[]>([]);
  const [relevanceNote, setRelevanceNote] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // LOAD PATH (2026-09-03): this page used to wait for the member's ENTIRE
  // shelf (`select *` on every user_products row, then a photo backfill and a
  // brand-offer lookup in series) before it could even find the one product
  // being opened — so a result that was already stored sat behind a queue of
  // unrelated queries. One targeted row read paints the stored analysis as
  // soon as it lands. The shelf copy still wins once it arrives (it carries
  // the photo backfill), so nothing about the data shown changes.
  const [directProduct, setDirectProduct] = useState<UserProduct | null>(null);
  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled && data) setDirectProduct(data as unknown as UserProduct);
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  const product = useMemo(
    () => allProducts.find(p => p.id === id) ?? directProduct ?? null,
    [allProducts, id, directProduct],
  );
  useIngredientIndex(product);

  // Single unified "flagged" set — appears in 3+ of the user's products.
  const flaggedNames = useMemo(() => new Set(flags.map(i => i.ingredient.toLowerCase())), [flags]);

  // Map of lower-cased ingredient name -> AI flag, for O(1) lookup in the list.
  const aiFlagByName = useMemo(() => {
    const map = new Map<string, IngredientFlag>();
    aiFlags.forEach((f) => map.set(f.name.toLowerCase().trim(), f));
    return map;
  }, [aiFlags]);

  const appearances = useMemo(() => {
    if (!product) return [] as Array<{
      id: string;
      date: string;
      stepName?: string;
      scalpFeel?: string | null;
      breakage?: string | null;
      styleAfter?: string | null;
      insight?: string | null;
      thumbPath?: string | null;
    }>;
    return washDays
      .filter(wd => wd.product_ids?.includes(product.id))
      .map(wd => {
        const step = (wd.steps ?? []).find(s => s.product_id === product.id);
        const styling = (wd as unknown as { styling?: { photoPaths?: string[] } | null }).styling ?? null;
        return {
          id: wd.id,
          date: wd.wash_date,
          stepName: step?.name,
          scalpFeel: wd.scalp_feel,
          breakage: wd.breakage,
          styleAfter: wd.style_after,
          insight: wd.ai_insight ?? wd.hair_feel_note,
          thumbPath: styling?.photoPaths?.[0] ?? null,
        };
      });
  }, [washDays, product]);

  const lastUse = appearances[0] ?? null;

  // Sign the first styling photo per appearance for use as a thumbnail.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const paths = appearances.filter(a => a.thumbPath).map(a => ({ id: a.id, p: a.thumbPath! }));
    if (paths.length === 0) { setThumbUrls({}); return; }
    (async () => {
      const entries = await Promise.all(paths.map(async ({ id, p }) => {
        const { data } = await supabase.storage.from("journal-photos").createSignedUrl(p, 3600);
        return [id, data?.signedUrl] as const;
      }));
      if (cancelled) return;
      const map: Record<string, string> = {};
      entries.forEach(([id, url]) => { if (url) map[id] = url; });
      setThumbUrls(map);
    })();
    return () => { cancelled = true; };
  }, [appearances]);

  // Personalised analysis is "sticky": once a product has been analysed for
  // this user we keep showing that result and DO NOT re-call the AI on every
  // visit. The cached row lives on user_products (ai_summary / match_score /
  // key_ingredients) and is invalidated server-side when the user's profile
  // changes (Phase 2.5 trigger). If no cached analysis exists yet (legacy
  // products), we run it once and persist back to user_products.
  useEffect(() => {
    if (!product || !user) return;
    if (!product.ingredients || product.ingredients.length === 0) return;

    // Hydrate from the saved row whenever we have any persisted analysis —
    // no network call. We treat the presence of ai_summary, match_score, OR
    // any saved key_ingredients with a flag as a complete cached analysis.
    const hasSavedFlags = (product.key_ingredients ?? []).some(
      (k) => k.flag || (k.benefit && k.benefit.trim().length > 0),
    );
    if (product.ai_summary || product.match_score != null || hasSavedFlags) {
      setAiSummary(product.ai_summary ?? null);
      setAiMatchScore(product.match_score ?? null);
      setAiScoreReasons(parseScoreReasons((product as unknown as { score_reasons?: unknown }).score_reasons));
      // Rehydrate per-ingredient flags from key_ingredients so the saved
      // good/warn/bad guidance shows immediately without re-calling the AI.
      const severityToTone = (
        s: "good" | "warn" | "avoid" | undefined,
      ): "good" | "warn" | "bad" | null => {
        if (s === "good") return "good";
        if (s === "warn") return "warn";
        if (s === "avoid") return "bad";
        return null;
      };
      const rehydrated: IngredientFlag[] = (product.key_ingredients ?? [])
        .map((k) => {
          const tone = severityToTone(k.flag);
          if (!tone) return null;
          return { name: k.name, tone, body: k.benefit ?? "" } satisfies IngredientFlag;
        })
        .filter((f): f is IngredientFlag => f !== null);
      setAiFlags(rehydrated);
      setAiLoading(false);
      setAiError(null);
      return;
    }

    // Nothing stored for this product at all — the one case where this page may
    // generate. The early return above means a row that already carries an
    // analysis can never reach here, so a second load costs nothing.
    const gate = decideProductAnalysis({
      hasSavedRow: true,
      capturedIngredientCount: (product.ingredients ?? []).length,
      isHomemade: (product as unknown as { is_homemade?: boolean }).is_homemade === true,
      storedScore: null,
      storedGeneratedAt: null,
      storedProfileHash: null,
      currentProfileHash: null,
      storedIngredientsHash: null,
      currentIngredientsHash: null,
      storedPayloadFound: false,
    });
    if (gate.action !== "generate") {
      setAiLoading(false);
      setAiError(null);
      setAiSummary(null);
      return;
    }
    assertAnalysisTrigger(gate.reason);


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
        const challenges = allChallenges(goals);
        const { data, error } = await aiInvoke<IngredientAnalysisResponse>("ingredient-analysis", {
            productKey: product.product_key,
            productName: product.name,
            productBrand: product.brand,
            trigger: gate.reason,

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
              challenges: challengesOf(g),
              status: g.status,
            })),
            currentStyle: styleLocal,
            challenges,
            context,
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
        const reasons = parseScoreReasons(data?.analysis?.score_reasons);
        setAiScoreReasons(reasons);
        setStrandTips(parseStrandTips(data?.analysis?.strand_tip));
        setRelevanceNote(parseRelevanceNote(data?.analysis?.relevance_note));

        // Persist to user_products so the next visit hydrates instantly and
        // never re-triggers the AI call. We save both the summary/score AND
        // the per-ingredient flags merged into key_ingredients.
        const flagToneToSeverity = (t: "good" | "warn" | "bad"): "good" | "warn" | "avoid" =>
          t === "bad" ? "avoid" : t;
        const existingByName = new Map(
          (product.key_ingredients ?? []).map((k) => [k.name.toLowerCase().trim(), k]),
        );
        const flagsByName = new Map(flags.map((f) => [f.name.toLowerCase().trim(), f]));
        const mergedNames = new Set([
          ...existingByName.keys(),
          ...flagsByName.keys(),
        ]);
        const mergedKeyIngredients = Array.from(mergedNames).map((lname) => {
          const base = existingByName.get(lname);
          const flag = flagsByName.get(lname);
          return {
            name: base?.name ?? flag?.name ?? lname,
            benefit: flag?.body ?? base?.benefit,
            flag: flag ? flagToneToSeverity(flag.tone) : base?.flag,
          };
        });
        if (!isViewingAs && (summary || score != null || mergedKeyIngredients.length > 0)) {
          await supabase
            .from("user_products")
            .update({
              ai_summary: summary,
              match_score: score,
              match_score_computed_at: score != null ? new Date().toISOString() : null,
              score_reasons: reasons as unknown as never,
              key_ingredients: mergedKeyIngredients,
            })
            .eq("id", product.id);
        }
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
  }, [product?.id, user?.id, isViewingAs]);

  // Only block on the shelf query while we have nothing to show — the targeted
  // row read above usually resolves first.
  if (loading && !product) {
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
  // Single source of truth: the persisted column (or the freshly analysed score
  // that was just written back to it) resolved through the shared accessor.
  // A declared sensitivity present in this formula caps the score with the same
  // graduated curve the shelf card and the server-side annotation use, so the
  // card and this page can never disagree — even on a pre-sensitivity cache row.
  const localSensitivityHits = scanSensitivities(ingredients, topicalEntries, "topical", {
    severities: ["avoid"],
  }).length;
  const displayScore = applySensitivityCeiling(
    matchScoreOf({ match_score: aiMatchScore ?? product.match_score }),
    localSensitivityHits,
  );
  const score = displayScore ?? 0;

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
      window.dispatchEvent(new CustomEvent("user-products-updated"));
      await reload();
    }
    setSavingRating(false);
  };

  const handleDelete = async () => {
    await remove(product.id);
    setConfirmDelete(false);
    safeBack(navigate, "/products");
  };

  // Title-case the saved category for the page title; fall back to "Product".
  const titleCategory = (product.category ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return (
    <IngredientProductScope productId={id ?? null}>
    <ScreenLayout bottomNav={false}>
      <TitleBar title={titleCategory || "Product"} back tips />
      <div className="px-5 pb-8 space-y-4">
        <SensitivityWarning ingredients={product.ingredients} />
        <ProductThumb
          imageUrl={product.image_url}
          storagePath={product.storage_path}
          alt={product.name}
          brand={product.brand}
          name={product.name}
          cover
          wrapperClassName="w-full aspect-square rounded-[18px] border border-border overflow-hidden bg-secondary"
        />

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold leading-tight">{product.name}</h1>
            {product.brand && <p className="text-sm text-muted-foreground"><BrandLink brand={product.brand} /></p>}
          </div>
        </div>

        {/* Personalised "red flag / green light" cards removed: we present
            neutral information only and leave decisions to the user. */}

{(() => {
          const summaryText = alignFitLanguage(aiSummary ?? product.ai_summary ?? "", score);
          const { phrase, rest } = summaryText ? emphasisSplit(summaryText) : { phrase: "", rest: "" };
          const scoreTone = toneForScore(score);
          return (
            <SurfaceCard tone="gold">
              <div className="mb-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">
                  Personalised guidance
                </p>
              </div>
              {score > 0 && (
                <AnchorStat
                  value={score}
                  context="hair-profile match"
                  tone={scoreTone}
                />
              )}
              {aiLoading ? (
                <div className="mt-3"><LoadingDot label="Personalising guidance for your profile…" /></div>
              ) : summaryText ? (
                <div className="mt-3">
                  <StatusCallout tone={scoreTone} icon={Sparkles} label="Verdict">
                    <p>
                      {phrase && (
                        <GlossaryRichText
                          text={`${phrase} `}
                          className="font-semibold text-foreground"
                        />
                      )}
                      <GlossaryRichText text={rest} className="text-foreground/75" />
                    </p>
                    <ScoreReasons reasons={aiScoreReasons} heading={scoreReasonsHeading(score)} />

                  </StatusCallout>
                  <RelevanceNote note={relevanceNote} />
                  <StrandTipNotes tips={strandTips} />
                </div>
              ) : aiError ? (
                <p className="mt-3 text-sm leading-snug text-muted-foreground">
                  Could not load guidance. {aiError}
                </p>
              ) : ingredients.length === 0 ? (
                <p className="mt-3 text-sm leading-snug text-muted-foreground">
                  Add ingredients to this product to get personalised guidance.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-snug text-muted-foreground">
                  No guidance saved yet for this product.
                </p>
              )}
            </SurfaceCard>
          );
        })()}

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
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">
              Wash days with this product
            </p>
            <div className="space-y-2">
              {appearances.map(a => {
                const chips = [a.stepName, a.scalpFeel, a.breakage, a.styleAfter]
                  .filter((c): c is string => !!c && c.trim().length > 0)
                  .slice(0, 3);
                const insight = a.insight?.replace(/\s+/g, " ").trim() ?? "";
                // Never truncate guidance — show the first complete sentence instead.
                const snippet = insight ? (insight.match(/^[^.!?]*[.!?]/)?.[0] ?? insight).trim() : "";
                const thumb = thumbUrls[a.id];
                return (
                  <SurfaceCard key={a.id} padded={false}>
                    <button
                      type="button"
                      onClick={() => navigate(`/wash-day/${a.id}`)}
                      className="w-full p-3 flex gap-3 text-left hover:bg-primary/5 rounded-inherit"
                      aria-label={`Review wash day on ${formatDate(a.date)}`}
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-primary/10 border border-border/60 flex items-center justify-center">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-lg">💧</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{formatDate(a.date)}</span>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-primary shrink-0">Review →</span>
                        </div>
                        {chips.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {chips.map((c, i) => (
                              <span
                                key={`${a.id}-${i}`}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/90"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                        {snippet && (
                          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                            {snippet}
                          </p>
                        )}
                      </div>
                    </button>
                  </SurfaceCard>
                );
              })}
            </div>
          </div>
        )}



        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 px-1">Strand rating</p>
          <SurfaceCard>
            {(() => {
              const hasScore = displayScore != null;
              return (
                <div className="flex items-center gap-2">
                  {hasScore ? (
                    <>
                      <MatchStars score={score} size="lg" showValue={false} />
                      <span className="text-[11px] text-muted-foreground">
                        Based on your hair profile
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Awaiting analysis</span>
                  )}
                </div>
              );
            })()}
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

            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {ingredients.map((name, i) => {
                const lower = name.toLowerCase().trim();
                const aiFlag = aiFlagByName.get(lower);
                // Single unified flag — appears in 3+ of the user's products.
                // Educational: tap to see other products that contain it.
                const isFlagged = flaggedNames.has(lower);
                const isClickable = isFlagged;
                const isExpanded = isClickable && expandedIngredient === lower;
                const matches = isClickable
                  ? allProducts.filter(p =>
                      p.id !== product.id &&
                      (p.on_shelf || p.on_wishlist) &&
                      (p.ingredients ?? []).some(ing => ing.toLowerCase().trim() === lower),
                    )
                  : [];
                const shelfMatches = matches.filter(p => p.on_shelf);
                const wishMatches = matches.filter(p => !p.on_shelf && p.on_wishlist);
                return (
                  <div key={i}>
                    <div className="w-full p-3 flex items-start gap-2.5 text-left">
                      <div className="flex-1 min-w-0">
                        {aiFlag ? (
                          <IngredientFlagRow
                            name={name}
                            reason={aiFlag.body ? condenseProse(aiFlag.body, tipsLevel) : undefined}
                            flag={aiFlag.tone}
                            sensitivity={
                              aiFlag.sensitivity === true ||
                              scanSensitivities(name, topicalEntries, "topical", {
                                severities: ["avoid"],
                              }).length > 0
                            }
                            className="border-none !p-0 bg-transparent"
                          />
                        ) : (
                          <p className="text-sm font-medium leading-tight">
                            <GlossaryLabel label={name} className="font-medium" forceToken />
                          </p>
                        )}


                        {isClickable && (
                          <button
                            type="button"
                            onClick={() => setExpandedIngredient(isExpanded ? null : lower)}
                            aria-expanded={isExpanded}
                            className="mt-1 text-[10px] text-primary/70 uppercase tracking-[0.15em] text-left"
                          >
                            {matches.length === 0
                              ? "Not in your shelf or wishlist"
                              : isExpanded
                                ? "Hide products"
                                : `Also in ${matches.length} of your product${matches.length === 1 ? "" : "s"} ›`}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && matches.length > 0 && (
                      <div className="bg-secondary/40">
                        {shelfMatches.length > 0 && (
                          <>
                            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              On your shelf
                            </p>
                            <div className="divide-y divide-border/40">
                              {shelfMatches.map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => navigate(`/products/profile/${m.id}`)}
                                  className="w-full pl-9 pr-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-primary/5"
                                >
                                  <div className="size-7 rounded-md overflow-hidden bg-primary/10 shrink-0 flex items-center justify-center text-sm">
                                    {m.image_url ? (
                                      <img src={m.image_url} alt={m.name} className="size-full object-cover" />
                                    ) : "🧴"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium leading-tight break-words">{m.name}</p>
                                    {m.brand && (
                                      <p className="text-[11px] text-muted-foreground break-words"><BrandLink brand={m.brand} /></p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {wishMatches.length > 0 && (
                          <>
                            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              On your wishlist
                            </p>
                            <div className="divide-y divide-border/40">
                              {wishMatches.map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => navigate(`/products/profile/${m.id}`)}
                                  className="w-full pl-9 pr-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-primary/5"
                                >
                                  <div className="size-7 rounded-md overflow-hidden bg-primary/10 shrink-0 flex items-center justify-center text-sm">
                                    {m.image_url ? (
                                      <img src={m.image_url} alt={m.name} className="size-full object-cover" />
                                    ) : "🧴"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium leading-tight break-words">{m.name}</p>
                                    {m.brand && (
                                      <p className="text-[11px] text-muted-foreground break-words"><BrandLink brand={m.brand} /></p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
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
            <>
              <Button
                variant="goldOutline"
                size="pill"
                onClick={() => setOffShelfOpen(true)}
              >
                <ArrowDownToLine className="size-4 mr-2" />
                Take off the shelf
              </Button>
              <Button variant="ghost" size="pill" onClick={() => setWishlist(product.id, true)}>
                Move to Wishlist
              </Button>
            </>
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

      <OffShelfReasonSheet
        open={offShelfOpen}
        onOpenChange={setOffShelfOpen}
        productId={product.id}
        productKey={product.product_key}
        productName={product.name}
        onComplete={reload}
      />

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
    </IngredientProductScope>
  );
};

export default ProductProfile;
