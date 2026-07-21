import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, Heart, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLogBrandStat, PlacementSlot } from "@/hooks/useBrandOffers";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useUserTools } from "@/hooks/useUserTools";
import { useGoals } from "@/hooks/useGoals";
import { useQuery } from "@tanstack/react-query";
import { buildAiContext } from "@/lib/aiContext";

const productKeyFor = (brandProductId: string) => `brand-offer:${brandProductId}`;
const toolKeyFor = (brandProductId: string) => `brand-offer-tool:${brandProductId}`;
const analysisCacheKind = (brandProductId: string) =>
  `brand_product_analysis:${brandProductId}`;
const guidanceCacheKind = (brandProductId: string) =>
  `brand_product_guidance:${brandProductId}`;

interface IngredientFlag {
  name: string;
  tone: "good" | "warn" | "bad";
  body: string;
}

type AnalysisPayload = {
  summary?: string | null;
  match_score?: number | null;
  ingredients?: IngredientFlag[];
  // Tool-analyse-url shape
  verdict?: string | null;
  rationale?: string | null;
  cautions?: string[];
};

type GuidancePayload = {
  headline: string;
  fit_summary: string;
  how_to_use: string[];
  benefits_for_you: string[];
  cautions: string[];
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const BrandProductPage = () => {
  const { offerId, productId } = useParams<{ offerId: string; productId: string }>();
  const [params] = useSearchParams();
  const slot = (params.get("slot") as PlacementSlot | null) ?? null;
  const nav = useNavigate();
  const { user } = useAuth();
  const logStat = useLogBrandStat();
  const { allProducts, upsert } = useUserProducts();
  const { tools: userTools, reload: reloadTools } = useUserTools();
  const { goals } = useGoals();
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<GuidancePayload | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-product-page", offerId, productId],
    enabled: !!offerId && !!productId,
    queryFn: async () => {
      const { data: prod, error: pe } = await supabase
        .from("brand_products")
        .select("*")
        .eq("id", productId!)
        .eq("offer_id", offerId!)
        .maybeSingle();
      if (pe) throw pe;
      const { data: off, error: oe } = await supabase
        .from("brand_offers")
        .select("id, headline, body_copy, discount_code, external_url, ends_on, starts_on, brand_user_id")
        .eq("id", offerId!)
        .maybeSingle();
      if (oe) throw oe;
      let brand: { brand_name: string | null } | null = null;
      if (off?.brand_user_id) {
        const { data: bp } = await supabase
          .from("brand_profiles")
          .select("brand_name")
          .eq("user_id", off.brand_user_id)
          .maybeSingle();
        brand = bp ?? null;
      }
      return { product: prod, offer: off ? { ...off, brand_profiles: brand } : null };
    },
  });


  const product = data?.product ?? null;
  const offer = data?.offer ?? null;
  const brandName =
    (offer as { brand_profiles?: { brand_name?: string } } | null)?.brand_profiles?.brand_name ?? null;
  const isTool = product?.kind === "tool";

  // Record tap when reaching page
  useEffect(() => {
    if (!offer?.id) return;
    logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  const findExistingProduct = () =>
    product
      ? allProducts.find(
          (row) =>
            row.product_key === productKeyFor(product.id) ||
            row.linked_brand_product_id === product.id ||
            (row.name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
              (row.brand ?? "").trim().toLowerCase() === (brandName ?? "").trim().toLowerCase()),
        )
      : undefined;

  const findExistingTool = () =>
    product
      ? userTools.find((t) => {
          const linked = (t as unknown as { linked_brand_product_id?: string | null })
            .linked_brand_product_id;
          return (
            t.tool_key === toolKeyFor(product.id) ||
            linked === product.id ||
            (t.name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
              (t.brand ?? "").trim().toLowerCase() === (brandName ?? "").trim().toLowerCase())
          );
        })
      : undefined;

  const alreadyWishlisted = useMemo(() => {
    if (!product) return false;
    return isTool ? !!findExistingTool() : !!findExistingProduct()?.on_wishlist;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, allProducts, userTools]);

  // ── Personalised analysis (cached per user+brand product) ──────────────
  useEffect(() => {
    if (!product || !user || !offer) return;
    let cancelled = false;

    const cacheKind = analysisCacheKind(product.id);

    (async () => {
      setAiLoading(true);
      setAiError(null);
      try {
        // Try cache first
        const { data: cached } = await supabase
          .from("ai_summaries")
          .select("payload")
          .eq("user_id", user.id)
          .eq("kind", cacheKind)
          .maybeSingle();
        if (cancelled) return;
        if (cached?.payload) {
          setAnalysis(cached.payload as AnalysisPayload);
          setAiLoading(false);
          return;
        }

        const context = await buildAiContext();

        if (isTool) {
          if (!product.external_url) {
            setAiError(
              "We can't analyse this tool without a product link. You can still add it to your wishlist.",
            );
            setAiLoading(false);
            return;
          }
          const { data: res, error } = await supabase.functions.invoke("tool-analyse-url", {
            body: { url: product.external_url, context },
          });
          if (error) throw error;
          if (res?.error) throw new Error(String(res.error));
          const payload: AnalysisPayload = {
            summary: typeof res?.rationale === "string" ? res.rationale : null,
            verdict: typeof res?.verdict === "string" ? res.verdict : null,
            rationale: typeof res?.rationale === "string" ? res.rationale : null,
            cautions: Array.isArray(res?.cautions) ? res.cautions : [],
          };
          if (cancelled) return;
          setAnalysis(payload);
          await supabase.from("ai_summaries").upsert(
            {
              user_id: user.id,
              kind: cacheKind,
              payload: payload as unknown as Record<string, unknown>,
            } as never,
            { onConflict: "user_id,kind" },
          );

        } else {
          const ingredients = (product.ingredients ?? []) as string[];
          if (ingredients.length === 0) {
            setAiError(
              "This product doesn't have an ingredient list yet, so we can't run a personalised check.",
            );
            setAiLoading(false);
            return;
          }
          const styleLocal = (() => {
            try {
              return JSON.parse(localStorage.getItem("strand_current_style") || "null");
            } catch {
              return null;
            }
          })();
          const challenges = goals
            .map((g) => g.challenge)
            .filter((c): c is string => Boolean(c && c.trim()));
          const { data: res, error } = await supabase.functions.invoke("ingredient-analysis", {
            body: {
              productKey: `brand-product:${product.id}`,
              productName: product.name,
              productBrand: brandName,
              ingredients,
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
          if (error) throw error;
          if (res?.error) throw new Error(String(res.error));
          const a = res?.analysis ?? {};
          const payload: AnalysisPayload = {
            summary: typeof a.summary === "string" ? a.summary : null,
            match_score: typeof a.match_score === "number" ? a.match_score : null,
            ingredients: Array.isArray(a.ingredients) ? a.ingredients : [],
          };
          if (cancelled) return;
          setAnalysis(payload);
          await supabase.from("ai_summaries").upsert(
            {
              user_id: user.id,
              kind: cacheKind,
              payload: payload as unknown as Record<string, unknown>,
            } as never,
            { onConflict: "user_id,kind" },
          );

        }
      } catch (e) {
        if (cancelled) return;
        setAiError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, user?.id, offer?.id]);

  // ── Personalised usage guidance: "how to get the most out of this" ──
  useEffect(() => {
    if (!product || !user || !offer) return;
    let cancelled = false;
    const cacheKind = guidanceCacheKind(product.id);

    (async () => {
      setGuidanceLoading(true);
      try {
        const { data: cached } = await supabase
          .from("ai_summaries")
          .select("payload")
          .eq("user_id", user.id)
          .eq("kind", cacheKind)
          .maybeSingle();
        if (cancelled) return;
        if (cached?.payload) {
          setGuidance(cached.payload as GuidancePayload);
          setGuidanceLoading(false);
          return;
        }

        const context = await buildAiContext();
        const { data: res, error } = await supabase.functions.invoke(
          "brand-product-guidance",
          {
            body: {
              product: {
                id: product.id,
                name: product.name,
                brand: brandName,
                description: product.description,
                kind: product.kind,
                tool_kind: product.tool_kind,
                external_url: product.external_url,
                ingredients: product.ingredients ?? [],
                key_features: product.key_features ?? [],
                materials: product.materials ?? [],
              },
              context,
            },
          },
        );
        if (error) throw error;
        if (res?.error) throw new Error(String(res.error));
        const g = res?.guidance as GuidancePayload | undefined;
        if (!g || cancelled) return;
        setGuidance(g);
        await supabase.from("ai_summaries").upsert(
          {
            user_id: user.id,
            kind: cacheKind,
            payload: g as unknown as Record<string, unknown>,
          } as never,
          { onConflict: "user_id,kind" },
        );
      } catch {
        // Silent — the other AI panel still renders.
      } finally {
        if (!cancelled) setGuidanceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, user?.id, offer?.id]);

  const addToWishlist = async () => {
    if (!user || !product || !offer) return;
    setBusy(true);
    try {
      if (isTool) {
        const existing = findExistingTool();
        if (existing) {
          toast.success("Already on your wishlist");
          nav("/products/wishlist");
          return;
        }
        const insertRow = {
          user_id: user.id,
          tool_key: toolKeyFor(product.id),
          name: product.name,
          brand: brandName,
          category: null,
          image_url: product.image_urls?.[0] ?? null,
          notes: product.description ?? null,
          source_url: product.external_url ?? null,
          on_shelf: false,
          linked_brand_offer_id: offer.id,
          linked_brand_product_id: product.id,
        };
        const { error } = await supabase.from("user_tools").insert(insertRow as never);
        if (error) throw error;
        await reloadTools();
      } else {
        const existing = findExistingProduct();
        const payload: Partial<UserProduct> & { product_key: string; name: string } = {
          product_key: existing?.product_key ?? productKeyFor(product.id),
          name: product.name,
          brand: brandName,
          ingredients: (product.ingredients ?? existing?.ingredients ?? []) as string[],
          image_url: product.image_urls?.[0] ?? existing?.image_url ?? null,
          linked_brand_offer_id: offer.id,
          linked_brand_product_id: product.id,
          on_wishlist: true,
        };
        const row = await upsert(payload);
        if (!row) throw new Error("Could not save to wishlist");
      }
      logStat.mutate({ offer_id: offer.id, slot, kind: "wishlist_adds" });
      toast.success("Added to your wishlist");
      nav("/products/wishlist");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add to wishlist");
    } finally {
      setBusy(false);
    }
  };


  const openExternal = () => {
    if (!offer || !product?.external_url) return;
    logStat.mutate({ offer_id: offer.id, slot, kind: "link_clicks" });
    window.open(product.external_url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) return <LoadingDot />;
  if (!product || !offer) {
    return (
      <ScreenLayout>
        <TitleBar title="Product" onBack={() => nav(-1)} />
        <div className="px-5 pt-4">
          <SurfaceCard>
            <p className="text-sm text-muted-foreground">
              This product is no longer available.
            </p>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  const heroImage = product.image_urls?.[0] ?? null;
  const validUntil = formatDate(offer.ends_on);

  return (
    <ScreenLayout>
      <TitleBar title={brandName ?? "Product"} onBack={() => nav(-1)} />
      <div className="px-5 pb-24 space-y-4">
        <SurfaceCard padded={false} className="overflow-hidden">
          {heroImage ? (
            <img src={heroImage} alt="" className="w-full aspect-square object-cover" />
          ) : (
            <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground text-xs">
              No image
            </div>
          )}
          <div className="p-4">
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-body">
              Sponsored · {isTool ? "Tool" : "Product"}
            </p>
            <p className="font-display text-xl mt-1 leading-tight">{product.name}</p>
            {brandName && (
              <p className="text-[13px] text-muted-foreground font-body mt-0.5">{brandName}</p>
            )}
            {product.description && (
              <p className="text-[13px] text-foreground/80 mt-3 leading-relaxed font-body">
                {product.description}
              </p>
            )}
          </div>
        </SurfaceCard>

        {/* Offer context */}
        {(offer.discount_code || validUntil) && (
          <SurfaceCard className="space-y-2.5">
            <SectionLabel className="!px-0 !mt-0">Offer</SectionLabel>
            {offer.headline && (
              <p className="font-display text-[15px] leading-tight">{offer.headline}</p>
            )}
            {offer.discount_code && (
              <DiscountCodeChip
                code={offer.discount_code}
                variant="block"
                onCopy={() => logStat.mutate({ offer_id: offer.id, slot, kind: "code_copies" })}
              />
            )}
            {validUntil && (
              <p className="text-[11px] text-muted-foreground font-body">
                Valid until {validUntil}
              </p>
            )}
          </SurfaceCard>
        )}

        {/* AI suitability */}
        <SurfaceCard className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <SectionLabel className="!px-0 !mt-0">Is this right for my hair?</SectionLabel>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-body">
              <Loader2 className="size-3.5 animate-spin" /> Checking against your profile…
            </div>
          )}
          {aiError && !aiLoading && (
            <p className="text-[12px] text-muted-foreground font-body">{aiError}</p>
          )}
          {!aiLoading && !aiError && analysis && (
            <>
              {typeof analysis.match_score === "number" && (
                <p className="text-[12px] text-muted-foreground font-body">
                  Match score:{" "}
                  <span className="text-foreground font-medium">
                    {Math.round(analysis.match_score)}/100
                  </span>
                </p>
              )}
              {analysis.verdict && (
                <p className="text-[13px] font-display leading-tight">{analysis.verdict}</p>
              )}
              {analysis.summary && (
                <p className="text-[13px] text-foreground/85 leading-relaxed font-body whitespace-pre-wrap">
                  {analysis.summary}
                </p>
              )}
              {Array.isArray(analysis.ingredients) && analysis.ingredients.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {analysis.ingredients.slice(0, 8).map((f) => (
                    <div key={f.name} className="flex gap-2">
                      <span
                        className={
                          "mt-1 size-2 rounded-full shrink-0 " +
                          (f.tone === "good"
                            ? "bg-good"
                            : f.tone === "warn"
                              ? "bg-warn"
                              : "bg-alert-dark")
                        }
                      />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium leading-tight">{f.name}</p>
                        {f.body && (
                          <p className="text-[11px] text-muted-foreground leading-snug font-body">
                            {f.body}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(analysis.cautions) && analysis.cautions.length > 0 && (
                <div className="pt-1 space-y-1">
                  {analysis.cautions.map((c, i) => (
                    <p key={i} className="text-[11px] text-alert-dark leading-snug font-body">
                      • {c}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground leading-snug font-body pt-1">
                Honest assessment based on your hair profile — not a sponsor endorsement.
              </p>
            </>
          )}
        </SurfaceCard>

        {/* Personalised usage playbook */}
        {(guidanceLoading || guidance) && (
          <SurfaceCard className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <SectionLabel className="!px-0 !mt-0">Get the most out of this</SectionLabel>
            </div>
            {guidanceLoading && !guidance && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-body">
                <Loader2 className="size-3.5 animate-spin" /> Building your usage playbook…
              </div>
            )}
            {guidance && (
              <>
                {guidance.headline && (
                  <p className="font-display text-[15px] leading-tight">{guidance.headline}</p>
                )}
                {guidance.fit_summary && (
                  <p className="text-[13px] text-foreground/85 leading-relaxed font-body">
                    {guidance.fit_summary}
                  </p>
                )}
                {guidance.how_to_use.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-body mb-1.5">
                      How to use it for your hair
                    </p>
                    <ul className="space-y-1">
                      {guidance.how_to_use.map((s, i) => (
                        <li key={i} className="text-[12.5px] leading-snug font-body flex gap-2">
                          <span className="text-primary shrink-0">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {guidance.benefits_for_you.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-body mb-1.5">
                      What you can expect
                    </p>
                    <ul className="space-y-1">
                      {guidance.benefits_for_you.map((s, i) => (
                        <li key={i} className="text-[12.5px] leading-snug font-body flex gap-2">
                          <span className="text-good shrink-0">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {guidance.cautions.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {guidance.cautions.map((c, i) => (
                      <p key={i} className="text-[11px] text-alert-dark leading-snug font-body">
                        • {c}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </SurfaceCard>
        )}


        {/* Actions */}
        <div className="space-y-2">
          {product.external_url && (
            <Button variant="gold" size="pill" onClick={openExternal} className="w-full">
              <ExternalLink className="size-4 mr-1.5" />
              {offer.discount_code ? `Get offer${brandName ? ` at ${brandName}` : ""}` : "Visit product"}
            </Button>
          )}
          <Button
            variant="outline"
            size="pill"
            onClick={addToWishlist}
            disabled={busy || alreadyWishlisted}
            className="w-full"
          >
            {alreadyWishlisted ? (
              <>
                <Check className="size-4 mr-1.5" /> On your wishlist
              </>
            ) : busy ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Heart className="size-4 mr-1.5" /> Add to wishlist
              </>
            )}
          </Button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default BrandProductPage;
