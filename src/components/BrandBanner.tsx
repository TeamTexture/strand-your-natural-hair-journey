import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveBrandOffer, useLogBrandStat, PlacementSlot } from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  slot: PlacementSlot;
}

/** Renders the paid+live brand offer holding this slot today. Silent when
 *  no offer is booked (no empty placeholder). Logs impressions and taps
 *  through the aggregated stats hook. */
const BrandBanner = ({ slot }: Props) => {
  const { data } = useActiveBrandOffer(slot);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const logStat = useLogBrandStat();
  const nav = useNavigate();

  const offer = data?.brand_offers;

  useEffect(() => {
    if (!offer) return;
    logStat.mutate({ offer_id: offer.id, slot, kind: "impressions" });
    if (offer.hero_image_path) {
      supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60).then(({ data: d }) => {
        setHeroUrl(d?.signedUrl ?? null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  if (!offer) return null;

  return (
    <button
      type="button"
      onClick={() => {
        logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
        nav(`/offers/${offer.id}?slot=${slot}`);
      }}
      className="w-full text-left rounded-[14px] overflow-hidden border border-primary/20 bg-card relative group"
    >
      <span className="absolute top-2 right-2 z-10 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
        Sponsored
      </span>
      {heroUrl && (
        <div className="aspect-[16/7] overflow-hidden">
          <img src={heroUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3">
        <p className="font-display text-[14px] leading-tight">{offer.headline}</p>
        {offer.body_copy && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">{offer.body_copy}</p>}
        {offer.discount_code && (
          <p className="text-[10px] text-primary mt-1.5 font-body font-medium">Code {offer.discount_code}</p>
        )}
      </div>
    </button>
  );
};

export default BrandBanner;
