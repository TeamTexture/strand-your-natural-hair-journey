import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useLogAdEvent, useAdViewTracker } from "@/hooks/useBrandOffers";
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
  brand_products?: BannerProductRow[] | null;
};

interface Props {
  offer: BannerOffer;
  /** Attribution surface for every event this banner logs. */
  slot: string;
  wasMatched?: boolean;
  matchReason?: string[] | null;
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
 *  Shared by the in-app placements (`BrandBanner`, which resolves delivery) and
 *  the public brand page, so a member who closes an advert can find the same
 *  card again in the brand directory with the same features. */
const BrandOfferBanner = ({ offer, slot, wasMatched = false, matchReason = null }: Props) => {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const logEvent = useLogAdEvent();
  const nav = useNavigate();

  // `view` fires only after the banner has been ≥50% visible for a continuous
  // 1s — never on mount/render.
  const viewRef = useAdViewTracker(offer.id, slot as never, {
    was_matched: wasMatched ? true : null,
    match_reason: matchReason ? { codes: matchReason } : null,
  });

  const product = offer.brand_products?.[0] ?? null;
  // The advert's product is read against this member's own hair — generated on
  // expand (a deliberate action), never on a passing impression.
  const { guidance: productGuidance, loading: productGuidanceLoading } =
    useBrandProductGuidance(product, { enabled: expanded });

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
                  <button
                    type="button"
                    tabIndex={expanded ? 0 : -1}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={openProduct}
                    className="mt-3 -mb-1 w-full flex items-center justify-between gap-2 border-t border-border pt-2.5 text-left"
                  >
                    <span className="text-[12px] font-body text-foreground/90">How to use it for your hair</span>
                    <ChevronRight className="size-4 text-primary shrink-0" />
                  </button>
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
