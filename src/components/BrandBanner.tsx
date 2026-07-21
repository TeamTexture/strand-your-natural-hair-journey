import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { useActiveBrandOffer, useLogBrandStat, PlacementSlot } from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";
import DiscountCodeChip from "@/components/DiscountCodeChip";


interface Props {
  slot: PlacementSlot;
}

const dismissKey = (slot: PlacementSlot, offerId: string) =>
  `strand:brand-banner:dismissed:${slot}:${offerId}`;

type BrandProductRow = {
  id: string;
  name: string;
  image_urls: string[] | null;
  external_url: string | null;
};

/** Collapsed strip (~80px) + expandable drop-down with body copy, discount
 *  code, CTA button, and the first attached product on the right. Silent
 *  when no offer holds the slot today. Dismissible for the session. */
const BrandBanner = ({ slot }: Props) => {
  const { data } = useActiveBrandOffer(slot);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const logStat = useLogBrandStat();
  const nav = useNavigate();

  const offer = data?.brand_offers as (typeof data extends { brand_offers: infer T } ? T : never) & {
    brand_products?: BrandProductRow[];
    external_url?: string | null;
  } | undefined;
  const product = offer?.brand_products?.[0] ?? null;

  useEffect(() => {
    if (!offer) return;
    try {
      if (sessionStorage.getItem(dismissKey(slot, offer.id))) {
        setDismissed(true);
        return;
      }
    } catch { /* sessionStorage disabled */ }
    logStat.mutate({ offer_id: offer.id, slot, kind: "impressions" });
    if (offer.hero_image_path) {
      supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60).then(({ data: d }) => {
        setHeroUrl(d?.signedUrl ?? null);
      });
    }
    const first = product?.image_urls?.[0];
    if (first) setProductImageUrl(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  if (!offer || dismissed) return null;

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { sessionStorage.setItem(dismissKey(slot, offer.id), "1"); } catch { /* noop */ }
    setDismissed(true);
  };

  const copyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!offer.discount_code) return;
    navigator.clipboard.writeText(offer.discount_code).then(() => {
      toast.success(`Code ${offer.discount_code} copied`);
    }).catch(() => toast.error("Could not copy"));
  };

  const visit = (e: React.MouseEvent) => {
    e.stopPropagation();
    logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
    if (offer.external_url) {
      window.open(offer.external_url, "_blank", "noopener,noreferrer");
    } else {
      nav(`/offers/${offer.id}?slot=${slot}`);
    }
  };

  const openProduct = (e: React.MouseEvent) => {
    e.stopPropagation();
    logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
    nav(`/offers/${offer.id}?slot=${slot}`);
  };

  const toggleExpand = () => {
    setExpanded((v) => {
      const next = !v;
      if (next) logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
      return next;
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleExpand}
        className={`w-full text-left overflow-hidden border border-primary/20 bg-card ${expanded ? "rounded-t-[14px] border-b-0" : "rounded-[14px]"}`}
      >
        <div className="relative" style={{ height: 80 }}>
          {heroUrl ? (
            <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          <span className="absolute top-1.5 left-2 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
            Sponsored
          </span>
          <div className="relative h-full flex items-center pl-3 pr-16 w-2/3">
            <p className="font-display text-white text-[15px] leading-tight line-clamp-2 drop-shadow-sm">
              {offer.headline}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="absolute right-9 top-1/2 -translate-y-1/2 size-4 text-white/85" />
          ) : (
            <ChevronDown className="absolute right-9 top-1/2 -translate-y-1/2 size-4 text-white/85" />
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss sponsored banner"
        className="absolute top-2 right-2 z-20 size-7 rounded-full bg-background/85 backdrop-blur border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
      {expanded && (
        <div className="rounded-b-[14px] border border-t-0 border-primary/20 bg-card p-3">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              {offer.body_copy && (
                <p className="text-[12px] text-foreground/80 leading-snug font-body">{offer.body_copy}</p>
              )}
              {offer.discount_code && (
                <button
                  type="button"
                  onClick={copyCode}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/30 px-2 py-1 hover:bg-primary/15"
                >
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-body">Tap to copy</span>
                  <span className="font-body font-medium text-[12px] text-primary">{offer.discount_code}</span>
                </button>
              )}
              <button
                type="button"
                onClick={visit}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-primary text-primary-foreground text-[12px] font-body font-medium py-1.5"
              >
                Visit offer <ExternalLink className="size-3" />
              </button>
            </div>
            {product && (
              <button
                type="button"
                onClick={openProduct}
                className="w-[92px] shrink-0 text-left"
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                  {productImageUrl && (
                    <img src={productImageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <p className="mt-1 text-[10px] font-body leading-tight line-clamp-2">{product.name}</p>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandBanner;
