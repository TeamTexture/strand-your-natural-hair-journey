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

  // (Personalised suitability analysis removed — the usage playbook below is the single AI surface for brand products.)


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

        {/* AI suitability section removed — personalised playbook below covers this */}


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
