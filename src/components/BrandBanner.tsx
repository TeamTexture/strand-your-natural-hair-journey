import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, Info, ThumbsDown } from "lucide-react";
import { useActiveBrandOffer, useLogAdEvent, useAdViewTracker, PlacementSlot } from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { getSignedUrl } from "@/lib/signedUrlCache";
import { useTargetingOptions, useDismissAdOffer } from "@/hooks/useAdTargeting";
import { explainMatch } from "@/lib/adTargeting";
import AdFitLine from "@/components/guidance/AdFitLine";
import { useBrandProductGuidance } from "@/hooks/useBrandProductGuidance";
import { toast } from "sonner";


interface Props {
  slot: PlacementSlot;
}

// Sponsored banners cannot be permanently dismissed — users can only collapse
// them via the chevron. (Previous session-scoped dismiss key removed.)

type BrandProductRow = {
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

/** Collapsed strip (~80px) + expandable drop-down with body copy, discount
 *  code, CTA button, and the first attached product on the right. Silent
 *  when no offer holds the slot today. Users can collapse but not dismiss. */
const BrandBanner = ({ slot }: Props) => {
  const { data } = useActiveBrandOffer(slot);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const logEvent = useLogAdEvent();
  const nav = useNavigate();
  const [showWhy, setShowWhy] = useState(false);
  const { data: targetingOptions } = useTargetingOptions();
  const dismissOffer = useDismissAdOffer();
  const wasMatched = !!data?.was_matched;
  const matchReason = data?.match_reason ?? null;
  const whyText = explainMatch(matchReason, targetingOptions);
  // `view` fires only after the banner has been ≥50% visible for a continuous
  // 1s — never on mount/render. Scrolling straight past records nothing.
  const viewRef = useAdViewTracker(data?.brand_offers?.id ?? null, slot, {
    was_matched: wasMatched ? true : null,
    match_reason: matchReason ? { codes: matchReason } : null,
  });

  const offer = data?.brand_offers as (typeof data extends { brand_offers: infer T } ? T : never) & {
    brand_products?: BrandProductRow[];
    external_url?: string | null;
  } | undefined;
  const product = offer?.brand_products?.[0] ?? null;
  // The advert's product is read against this member's own hair — generated on
  // expand (a deliberate action), never on a passing impression.
  const { guidance: productGuidance, loading: productGuidanceLoading } =
    useBrandProductGuidance(product, { enabled: expanded });

  useEffect(() => {
    if (!offer) return;
    if (offer.hero_image_path) {
      void getSignedUrl("brand-assets", offer.hero_image_path).then(setHeroUrl);
    }
    const first = product?.image_urls?.[0];
    if (first) setProductImageUrl(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  if (!offer) return null;





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
    <div className="relative" ref={viewRef}>
      {/* Collapsed strip — a div role=button (not a <button>) so the dismiss (×)
       *  and other interactive children never nest inside a button. onClick
       *  preventDefault stops any accidental default behaviour. */}
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
          {/* The brand creative carries its own artwork and copy, so only a
           *  light scrim is used — enough for the chips to stay legible
           *  without hiding the advert itself. */}
          <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black/35 to-transparent" />
          <span className="absolute top-1.5 left-2 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body pointer-events-none">
            Sponsored
          </span>
          {!heroUrl && (
            <div className="relative h-full flex items-center pl-3 pr-16 w-2/3 pointer-events-none">
              <p className="font-display text-foreground text-[15px] leading-tight line-clamp-2">
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
       *  anchored at the top and content below flows down smoothly, with no
       *  scroll-jump / scroll-anchoring surprises. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="rounded-b-[14px] border border-t-0 border-primary/20 bg-card p-3">
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                {offer.headline && (
                  <p className="font-display text-[14px] leading-tight mb-1">{offer.headline}</p>
                )}
                {offer.body_copy && (
                  <p className="text-[12px] text-foreground/80 leading-snug font-body">{offer.body_copy}</p>
                )}
                {offer.discount_code && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <DiscountCodeChip
                      code={offer.discount_code}
                      variant="chip"
                      onCopy={() => logEvent.mutate({ offer_id: offer.id, slot, event_type: "code_copy" })}
                    />
                  </div>
                )}
                {wasMatched && (
                  <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      tabIndex={expanded ? 0 : -1}
                      onClick={() => setShowWhy((v) => !v)}
                      className="inline-flex items-center gap-1 text-[10.5px] font-body text-muted-foreground underline underline-offset-2"
                    >
                      <Info className="size-3" /> Why am I seeing this?
                    </button>
                    {showWhy && whyText && (
                      <p className="text-[10.5px] font-body text-muted-foreground leading-snug">
                        {whyText}{" "}
                        <button
                          type="button"
                          onClick={() => nav("/profile/personalised-offers")}
                          className="underline underline-offset-2"
                        >
                          Manage personalised offers
                        </button>
                      </p>
                    )}
                    <button
                      type="button"
                      tabIndex={expanded ? 0 : -1}
                      onClick={() => {
                        dismissOffer.mutate(offer.id, {
                          onSuccess: () => toast.success("We won't show you that one again."),
                          onError: () => toast.error("Could not save that — try again."),
                        });
                      }}
                      className="inline-flex items-center gap-1 text-[10.5px] font-body text-muted-foreground underline underline-offset-2"
                    >
                      <ThumbsDown className="size-3" /> Not relevant to my hair
                    </button>
                  </div>
                )}
                {product && (
                  <AdFitLine
                    text={productGuidance?.fit_line}
                    loading={productGuidanceLoading}
                    className="mt-2"
                  />
                )}
                <button
                  type="button"
                  tabIndex={expanded ? 0 : -1}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={visit}
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-primary text-primary-foreground text-[12px] font-body font-medium py-1.5"
                >
                  Visit offer <ExternalLink className="size-3" />
                </button>
              </div>
              {product && (
                <button
                  type="button"
                  tabIndex={expanded ? 0 : -1}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={openProduct}
                  className="w-[92px] shrink-0 text-left"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                    {productImageUrl && (
                      <img src={productImageUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] font-body leading-tight line-clamp-2">{product.name}</p>
                  <p className="text-[9.5px] font-body text-primary leading-tight mt-0.5">
                    How to use it for your hair
                  </p>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandBanner;
