import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { ChevronDown, ChevronUp, ChevronRight, ExternalLink, Plus, Check, Loader2 } from "lucide-react";
import { useLogAdEvent, useAdViewTracker } from "@/hooks/useBrandOffers";
import { useAuth } from "@/hooks/useAuth";
import { useUserProducts } from "@/hooks/useUserProducts";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { getSignedUrl } from "@/lib/signedUrlCache";
import AdFitLine from "@/components/guidance/AdFitLine";
import { useBrandProductGuidance } from "@/hooks/useBrandProductGuidance";



export type BannerProductRow = {
  id: string;
  name: string;
  description?: string | null;
  kind?: string | null;
  tool_kind?: string | null;
  ingredients?: string[] | null;
  key_features?: string[] | null;
  materials?: string[] | null;
  image_urls: string[] | null;
  external_url: string | null;
};

export type BannerOffer = {
  id: string;
  headline: string | null;
  body_copy?: string | null;
  hero_image_path?: string | null;
  external_url?: string | null;
  discount_code?: string | null;
  brand_user_id?: string | null;
  /** ONE PRODUCT PER ADVERT — the array carries a single row. */
  brand_products?: BannerProductRow[] | null;
};

interface Props {
  offer: BannerOffer;
  /** Attribution surface for every event this banner logs. */
  slot: string;
  wasMatched?: boolean;
  matchReason?: string[] | null;
  /** Brand name shown beneath the product name; looked up when not supplied. */
  brandName?: string | null;
  /**
   * COLLAPSED STATE. The banner is collapsed by default everywhere (home page
   * included) — this prop only adds an explicit worded control to the collapsed
   * strip, e.g. "See full offer" on the wash day screen where the advert sits
   * under the sponsored tip and needs to read as openable. Omitted on the home
   * page, so its appearance is byte-for-byte unchanged.
   */
  collapsedCta?: string | null;
}



/** The advert exactly as it renders in a consumer placement: collapsed strip
 *  (~96px) plus a drop-down carrying the body copy, discount code, the
 *  member-specific product read and the attached product thumbnail.
 *
 *  The "SPONSORED" label is the disclosure and always renders. There are no
 *  per-advert member controls here: understanding and withdrawing personalised
 *  targeting is handled globally by the `personalised_offers` consent and the
 *  Personalised offers preferences page.
 *
 *  THIS IS THE ONLY ADVERT RENDERER IN THE CODEBASE. Every placement — home,
 *  products, wash day (beneath the sponsored tip), the public brand page —
 *  renders this component. Never fork it for a surface-specific variant: two
 *  advert renderers is how the duplicated product rows happened.
 *
 *  Shared by the in-app placements (`BrandBanner`, which resolves delivery) and
 *  the public brand page, so a member who closes an advert can find the same
 *  card again in the brand directory with the same features. */
const BrandOfferBanner = ({ offer, slot, wasMatched = false, matchReason = null, brandName: brandNameProp = null, collapsedCta = null }: Props) => {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);
  const logEvent = useLogAdEvent();
  const nav = useNavigate();
  const { user } = useAuth();
  const { allProducts, upsert } = useUserProducts();


  // `view` fires only after the banner has been ≥50% visible for a continuous
  // 1s — never on mount/render.
  const viewRef = useAdViewTracker(offer.id, slot as never, {
    was_matched: wasMatched ? true : null,
    match_reason: matchReason ? { codes: matchReason } : null,
  });

  // ONE PRODUCT PER ADVERT. The junction rows are ordered by `position` in the
  // query, so this is the advertised product — there is no list to choose from.
  const product = offer.brand_products?.[0] ?? null;
  // The advert's product is read against this member's own hair — generated on
  // expand (a deliberate action), never on a passing impression.
  const { guidance: productGuidance, loading: productGuidanceLoading } =
    useBrandProductGuidance(product, { enabled: expanded });

  const { data: brandRow } = useQuery({
    queryKey: ["banner-brand-name", offer.brand_user_id],
    enabled: !brandNameProp && !!offer.brand_user_id && expanded,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_profiles")
        .select("brand_name")
        .eq("user_id", offer.brand_user_id!)
        .maybeSingle();
      return data;
    },
  });
  const brandName = brandNameProp ?? brandRow?.brand_name ?? null;


  useEffect(() => {
    if (offer.hero_image_path) {
      void getSignedUrl("brand-assets", offer.hero_image_path).then(setHeroUrl);
    }
    const first = product?.image_urls?.[0];
    if (first) setProductImageUrl(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  const visit = (e: React.MouseEvent) => {
    e.stopPropagation();
    logEvent.mutate({ offer_id: offer.id, slot, event_type: "link_click", was_matched: wasMatched ? true : null, match_reason: matchReason ? { codes: matchReason } : null });
    if (offer.external_url) {
      window.open(offer.external_url, "_blank", "noopener,noreferrer");
    } else {
      nav(`/offers/${offer.id}?slot=${slot}`);
    }
  };

  const openProduct = (e: React.MouseEvent) => {
    e.stopPropagation();
    logEvent.mutate({ offer_id: offer.id, slot, event_type: "expand" });
    if (product) {
      nav(`/offers/${offer.id}/product/${product.id}?slot=${slot}`);
    } else {
      nav(`/offers/${offer.id}?slot=${slot}`);
    }
  };

  // ADD TO SHELF lives here, in the advert's product block — it used to be
  // duplicated in the wash day sponsored tip card. One place only.
  const shelfRow = useMemo(() => {
    if (!product) return null;
    return (
      allProducts.find(
        (row) =>
          row.linked_brand_product_id === product.id ||
          row.product_key === `brand-offer:${product.id}` ||
          (row.name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
            (row.brand ?? "").trim().toLowerCase() === (brandName ?? "").trim().toLowerCase()),
      ) ?? null
    );
  }, [allProducts, product, brandName]);
  const onShelf = !!shelfRow?.on_shelf;

  const addToShelf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !product) return;
    setShelfBusy(true);
    try {
      const row = await upsert({
        product_key: shelfRow?.product_key ?? `brand-offer:${product.id}`,
        name: product.name,
        brand: brandName,
        ingredients: (product.ingredients ?? []) as string[],
        image_url: product.image_urls?.[0] ?? null,
        linked_brand_offer_id: offer.id,
        linked_brand_product_id: product.id,
        on_shelf: true,
        on_wishlist: false,
      });
      if (!row) throw new Error("Could not add to your shelf");
      logEvent.mutate({ offer_id: offer.id, brand_product_id: product.id, slot, event_type: "shelf_add" });
      toast.success("Added to your shelf");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add to your shelf");
    } finally {
      setShelfBusy(false);
    }
  };


  const toggleExpand = () => {
    setExpanded((v) => {
      const next = !v;
      if (next) logEvent.mutate({ offer_id: offer.id, slot, event_type: "expand" });
      return next;
    });
  };

  const onStripKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpand();
    }
  };

  return (
    <div className="relative min-w-0" ref={viewRef}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse sponsored banner" : "Expand sponsored banner"}
        onClick={(e) => {
          e.preventDefault();
          toggleExpand();
        }}
        onKeyDown={onStripKey}
        className={`w-full text-left overflow-hidden border border-primary/20 bg-card cursor-pointer select-none ${expanded ? "rounded-t-[14px] border-b-0" : "rounded-[14px]"}`}
      >
        <div className="relative" style={{ height: 96 }}>
          {heroUrl ? (
            <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
          )}
          <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black/35 to-transparent" />
          <span className="absolute top-1.5 left-2 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body pointer-events-none">
            Sponsored
          </span>
          {!heroUrl && (
            <div className="relative h-full flex items-center pl-3 pr-16 w-2/3 pointer-events-none min-w-0">
              <p className="font-display text-foreground text-[15px] leading-tight line-clamp-2 [overflow-wrap:anywhere]">
                {offer.headline || product?.name || "Sponsored offer"}
              </p>
            </div>
          )}
          {/* Worded open control, only where a caller asks for one (wash day).
           *  Without `collapsedCta` the strip is exactly as the home page has
           *  always rendered it: hero, SPONSORED label, chevron. */}
          {collapsedCta && !expanded && (
            <span className="absolute bottom-1.5 right-9 inline-flex items-center gap-1 rounded-pill bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-body font-semibold text-foreground pointer-events-none">
              {collapsedCta}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-white drop-shadow pointer-events-none" />
          ) : (
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-white drop-shadow pointer-events-none" />
          )}

        </div>
      </div>
      {/* Grid-rows transition — expands the row 0fr → 1fr so the banner stays
       *  anchored at the top and content below flows down smoothly. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          {/* STACKED, never split into columns: headline/copy → discount code →
           *  the member-specific read → the product block (full width) →
           *  "Visit offer". The product is the second most prominent element
           *  after the code, because this card exists to sell it. */}
          <div className="rounded-b-[14px] border border-t-0 border-primary/20 bg-card p-3 min-w-0">
            {offer.headline && (
              <p className="font-display text-[14px] leading-tight mb-1 [overflow-wrap:anywhere]">{offer.headline}</p>
            )}
            {offer.body_copy && (
              <p className="text-[12px] text-foreground/80 leading-snug font-body [overflow-wrap:anywhere]">{offer.body_copy}</p>
            )}
            {offer.discount_code && (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                <DiscountCodeChip
                  code={offer.discount_code}
                  variant="chip"
                  onCopy={() => logEvent.mutate({ offer_id: offer.id, slot, event_type: "code_copy" })}
                />
              </div>
            )}
            {product && (
              <>
                <AdFitLine
                  text={productGuidance?.fit_line}
                  loading={productGuidanceLoading}
                  className="mt-4"
                />
                {/* The one advertised product — full width, 12px padding,
                 *  12px thumbnail gap, 16px clear above and below. */}
                <div className="mt-4 rounded-[12px] border border-border bg-background/60 p-3 min-w-0">
                  <button
                    type="button"
                    tabIndex={expanded ? 0 : -1}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={openProduct}
                    className="w-full text-left flex items-start gap-3 min-w-0"
                  >
                    <div className="size-[72px] shrink-0 rounded-[10px] overflow-hidden bg-muted border border-border">
                      {productImageUrl && (
                        <img src={productImageUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-[13.5px] leading-snug line-clamp-2 [overflow-wrap:anywhere]">
                        {product.name}
                      </p>
                      {brandName && (
                        <p className="mt-1 text-[11px] font-body text-muted-foreground leading-tight [overflow-wrap:anywhere]">
                          {brandName}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="mt-3 -mb-1 flex items-center gap-2 border-t border-border pt-2.5">
                    <button
                      type="button"
                      tabIndex={expanded ? 0 : -1}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={openProduct}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                    >
                      <span className="text-[12px] font-body text-foreground/90">How to use it for your hair</span>
                      <ChevronRight className="size-4 text-primary shrink-0" />
                    </button>
                    {/* The only add-to-shelf in an advert. Beside the guidance
                     *  row, never duplicated in the sponsored tip above. */}
                    <button
                      type="button"
                      tabIndex={expanded ? 0 : -1}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={addToShelf}
                      disabled={shelfBusy || onShelf}
                      aria-label={onShelf ? "On your shelf" : "Add to my shelf"}
                      className="shrink-0 inline-flex items-center gap-1 rounded-pill border border-primary/40 px-2.5 py-1 text-[11px] font-body font-semibold text-primary disabled:opacity-60"
                    >
                      {shelfBusy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : onShelf ? (
                        <Check className="size-3" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                      {onShelf ? "On shelf" : "Add"}
                    </button>
                  </div>

                </div>
              </>
            )}
            <button
              type="button"
              tabIndex={expanded ? 0 : -1}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={visit}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-primary text-primary-foreground text-[12px] font-body font-medium py-2"
            >
              Visit offer <ExternalLink className="size-3" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BrandOfferBanner;
