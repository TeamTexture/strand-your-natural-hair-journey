import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { smartBack } from "@/lib/smartBack";
import { ExternalLink, Heart, Check, Loader2, Sparkles, Plus } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import BenefitRows from "@/components/guidance/BenefitRows";
import AdFitLine from "@/components/guidance/AdFitLine";
import { adFallbackFitLine } from "@/lib/adFallbackCopy";
import NumberedSteps from "@/components/guidance/NumberedSteps";
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
import { useLogAdEvent, PlacementSlot } from "@/hooks/useBrandOffers";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useUserTools } from "@/hooks/useUserTools";
import {
  addBrandProductToShelf,
  type BrandShelfProduct,
} from "@/lib/addBrandProductToShelf";
import { useGoals } from "@/hooks/useGoals";
import { useQuery } from "@tanstack/react-query";
import {
  useBrandProductGuidance,
  type BrandGuidanceProduct,
} from "@/hooks/useBrandProductGuidance";

const productKeyFor = (brandProductId: string) => `brand-offer:${brandProductId}`;
const toolKeyFor = (brandProductId: string) => `brand-offer-tool:${brandProductId}`;


const formatDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const BrandProductPage = () => {
  // Reached two ways: from an advert (/offers/:offerId/product/:productId) and
  // straight from a brand's permanent shelf (/brands/:brandUserId/catalogue/
  // :brandProductId), where there is no offer at all.
  const {
    offerId,
    productId: offerProductId,
    brandProductId,
  } = useParams<{ offerId: string; productId: string; brandProductId: string }>();
  const productId = offerProductId ?? brandProductId;
  const [params] = useSearchParams();
  const slot = (params.get("slot") as PlacementSlot | null) ?? null;
  const nav = useNavigate();
  const { user } = useAuth();
  const logEvent = useLogAdEvent();
  const { allProducts, upsert } = useUserProducts();
  const { tools: userTools, reload: reloadTools } = useUserTools();
  const { goals } = useGoals();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-product-page", offerId, productId],
    enabled: !!productId,
    queryFn: async () => {
      // The product is the stable entity — fetch it by id alone. An offer id in
      // the route is only a hint; offers end and relaunch, the product persists.
      const { data: prod, error: pe } = await supabase
        .from("brand_products")
        .select("*")
        .eq("id", productId!)
        .maybeSingle();
      if (pe) throw pe;

      // Resolve the offer to show from the product's current live/scheduled
      // link, falling back to the route's offer id.
      const today = new Date().toISOString().slice(0, 10);
      const { data: links } = await supabase
        .from("brand_offer_products")
        .select("offer_id, brand_offers!inner(id, headline, body_copy, discount_code, external_url, ends_on, starts_on, brand_user_id, status)")
        .eq("brand_product_id", productId!);
      type Row = {
        offer_id: string;
        brand_offers: {
          id: string; headline: string | null; body_copy: string | null; discount_code: string | null;
          external_url: string | null; ends_on: string | null; starts_on: string | null;
          brand_user_id: string; status: string;
        };
      };
      const rows = ((links ?? []) as unknown as Row[]).map((r) => r.brand_offers).filter(Boolean);
      const isLive = (o: Row["brand_offers"]) =>
        o.status === "live" && (!o.starts_on || o.starts_on <= today) && (!o.ends_on || o.ends_on >= today);
      let off = rows.find(isLive) ?? rows.find((o) => o.id === offerId) ?? null;

      if (!off && offerId) {
        const { data: fallback } = await supabase
          .from("brand_offers")
          .select("id, headline, body_copy, discount_code, external_url, ends_on, starts_on, brand_user_id, status")
          .eq("id", offerId)
          .maybeSingle();
        off = (fallback as Row["brand_offers"] | null) ?? null;
      }

      let brand: { brand_name: string | null } | null = null;
      const brandOwner = off?.brand_user_id ?? prod?.brand_user_id ?? null;
      if (brandOwner) {
        const { data: bp } = await supabase
          .from("brand_profiles")
          .select("brand_name")
          .eq("user_id", brandOwner)
          .maybeSingle();
        brand = bp ?? null;
      }
      return { product: prod, offer: off ? { ...off, brand_profiles: brand } : null, brand };
    },
  });


  const product = data?.product ?? null;
  const offer = data?.offer ?? null;
  const brandName =
    (offer as { brand_profiles?: { brand_name?: string } } | null)?.brand_profiles?.brand_name ?? null;
  const isTool = product?.kind === "tool";

  // Reaching this page is a deliberate expand of the advert — not a view.
  useEffect(() => {
    if (!offer?.id) return;
    if (offer) logEvent.mutate({ offer_id: offer.id, slot, event_type: "expand" });
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
    if (isTool) {
      const t = findExistingTool() as { on_wishlist?: boolean | null } | undefined;
      return !!t && !!t.on_wishlist;
    }
    return !!findExistingProduct()?.on_wishlist;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, allProducts, userTools]);

  const alreadyOnShelf = useMemo(() => {
    if (!product) return false;
    if (isTool) {
      const t = findExistingTool() as { on_shelf?: boolean | null } | undefined;
      return !!t && !!t.on_shelf;
    }
    return !!findExistingProduct()?.on_shelf;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, allProducts, userTools]);


  // ── Personalised guidance: benefits for THIS member's hair + how to get the
  //    most out of it. Shared with the banner and offer-page surfaces so the
  //    same reasoning shows wherever this advert appears. ──
  const { guidance, loading: guidanceLoading, needsFallback } = useBrandProductGuidance(
    product ? { ...(product as unknown as BrandGuidanceProduct), brand: brandName } : null,
  );
  // Never an empty slot on an ad surface: generic (brand-declared) usage copy
  // stands in when the personalised line times out or is rejected.
  const fitLine =
    guidance?.fit_line ?? (needsFallback && product ? adFallbackFitLine(product) : undefined);


  // Adding is NOT conditional on a live advert. This screen is also reached
  // straight from a brand's permanent shelf (/brands/:id/product/:id), where
  // `offer` is null — the old `!offer` guard made those adds do nothing at all,
  // which is why no brand tool ever reached a member's shelf.
  // One shared writer handles products (user_products) and tools (user_tools),
  // so the link, the de-duplication and the offer credit can never drift.
  const save = async (destination: "shelf" | "wishlist") => {
    if (!user || !product) return;
    const toShelf = destination === "shelf";
    setBusy(true);
    try {
      const added = await addBrandProductToShelf({
        userId: user.id,
        brandName,
        product: product as unknown as BrandShelfProduct,
        destination,
        offerId: offer?.id ?? null,
      });
      if (!added) throw new Error(toShelf ? "Could not add to your shelf" : "Could not save to wishlist");
      if (added.kind === "tool") await reloadTools();
      if (offer) logEvent.mutate({ offer_id: offer.id, slot, event_type: "wishlist" });
      toast.success(toShelf ? "Added to your shelf" : "Added to your wishlist");
      if (added.kind === "tool") {
        nav(`/tools/${added.toolId}`);
        return;
      }
      nav(toShelf ? "/products" : "/products/wishlist");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : toShelf ? "Could not add to your shelf" : "Could not add to wishlist",
      );
    } finally {
      setBusy(false);
    }
  };




  const openExternal = () => {
    if (!product?.external_url) return;
    if (offer) logEvent.mutate({ offer_id: offer.id, slot, event_type: "link_click" });
    window.open(product.external_url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) return <LoadingDot />;
  // Only a missing PRODUCT is a dead end. A missing or ended offer still shows
  // the product — the product is the thing the member cares about.
  if (!product) {
    return (
      <ScreenLayout>
        <TitleBar title="Product" onBack={smartBack(nav, "/products")} />
        <div className="px-5 pt-4 space-y-3">
          <SurfaceCard>
            <p className="text-sm text-muted-foreground">
              This product is no longer available.
            </p>
          </SurfaceCard>
          <Button variant="goldOutline" size="pill" className="w-full" onClick={() => nav("/products")}>
            Back to my products
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  const heroImage = product.image_urls?.[0] ?? null;
  const validUntil = formatDate(offer?.ends_on);

  return (
    <ScreenLayout>
      <TitleBar title={brandName ?? "Product"} />
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
              {offer ? "Sponsored · " : ""}{isTool ? "Tool" : "Product"}
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
            {/* The personalised hook — why this matters for THIS member's hair. */}
            <AdFitLine
              text={fitLine}
              loading={guidanceLoading}
              className="mt-3"
            />
          </div>
        </SurfaceCard>

        {/* Offer context */}
        {offer && (offer.discount_code || validUntil) && (
          <SurfaceCard className="space-y-2.5">
            <SectionLabel className="!px-0 !mt-0">Offer</SectionLabel>
            {offer.headline && (
              <p className="font-display text-[15px] leading-tight">{offer.headline}</p>
            )}
            {offer.discount_code && (
              <DiscountCodeChip
                code={offer.discount_code}
                variant="block"
                onCopy={() => { if (offer) logEvent.mutate({ offer_id: offer.id, slot, event_type: "code_copy" }); }}
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
          <GuidanceCard
            eyebrow="Get the most out of this"
            icon={Sparkles}
            tone="gold"
            headline={guidance?.headline || undefined}
            className="px-5 py-[22px]"
          >
            {guidanceLoading && !guidance && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-body">
                <Loader2 className="size-3.5 animate-spin" /> Building your usage playbook…
              </div>
            )}
            {guidance && (
              <div className="space-y-4">
                {guidance.intro && (
                  <p className="text-[13.5px] leading-relaxed font-body text-foreground/85">
                    {guidance.intro}
                  </p>
                )}
                {guidance.benefits.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] font-bold font-body text-primary mb-2.5">
                      What it does for your hair
                    </p>
                    <BenefitRows benefits={guidance.benefits} idPrefix="brand-benefit" />
                  </div>
                )}
                {guidance.steps.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] font-bold font-body text-primary mb-2.5">
                      How to use it
                    </p>
                    <NumberedSteps steps={guidance.steps} idPrefix="brand-step" />
                  </div>
                )}
              </div>
            )}
          </GuidanceCard>
        )}




        {/* Actions */}
        <div className="space-y-2">
          {product.external_url && (
            <Button variant="gold" size="pill" onClick={openExternal} className="w-full">
              <ExternalLink className="size-4 mr-1.5" />
              {offer?.discount_code ? `Get offer${brandName ? ` at ${brandName}` : ""}` : "Visit product"}
            </Button>
          )}
          <Button
            variant={product.external_url ? "goldOutline" : "gold"}
            size="pill"
            onClick={() => save("shelf")}
            disabled={busy || alreadyOnShelf}
            className="w-full"
          >
            {alreadyOnShelf ? (
              <>
                <Check className="size-4 mr-1.5" /> {isTool ? "In my tools" : "On your shelf"}
              </>
            ) : busy ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Plus className="size-4 mr-1.5" /> {isTool ? "Add to my tools" : "Add to my shelf"}
              </>
            )}
          </Button>
          {!alreadyOnShelf && (
            <Button
              variant="outline"
              size="pill"
              onClick={() => save("wishlist")}
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
          )}

        </div>
      </div>
    </ScreenLayout>
  );
};

export default BrandProductPage;
