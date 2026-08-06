import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Sparkles, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { supabase } from "@/integrations/supabase/client";
import { useAdViewTracker, useLogAdEvent } from "@/hooks/useBrandOffers";

export interface SponsoredOffer {
  id: string;
  headline: string | null;
  body_copy: string | null;
  hero_image_path: string | null;
  discount_code: string | null;
  external_url: string | null;
  brand_user_id: string;
  ends_on?: string | null;
}

/** Days left, inclusive of today, from an ISO date string. */
function daysLeft(endsOn?: string | null): number | null {
  if (!endsOn) return null;
  const end = new Date(`${endsOn}T23:59:59`);
  const diff = end.getTime() - Date.now();
  if (diff < 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Rich sponsored offer card: live creative thumbnail, brand identity,
 *  discount code and how long the placement has left to run. */
const SponsoredOfferCard = ({ offer }: { offer: SponsoredOffer }) => {
  const navigate = useNavigate();
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logEvent = useLogAdEvent();
  // Viewability-gated view event: ≥50% visible for a continuous 1s.
  const viewRef = useAdViewTracker(offer.id, null);

  const { data: brand } = useQuery({
    queryKey: ["brand-profile-lite", offer.brand_user_id],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_profiles")
        .select("brand_name, logo_path, category")
        .eq("user_id", offer.brand_user_id)
        .maybeSingle();
      return data;
    },
  });

  const { data: firstProduct } = useQuery({
    queryKey: ["offer-first-product", offer.id],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_products")
        .select("id")
        .eq("offer_id", offer.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    let active = true;
    const sign = async (path: string | null | undefined, set: (u: string | null) => void) => {
      if (!path) return;
      const { data } = await supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60);
      if (active) set(data?.signedUrl ?? null);
    };
    sign(offer.hero_image_path, setHeroUrl);
    sign(brand?.logo_path, setLogoUrl);
    return () => {
      active = false;
    };
  }, [offer.hero_image_path, brand?.logo_path]);

  const left = daysLeft(offer.ends_on);
  const openOffer = () => {
    logEvent.mutate({ offer_id: offer.id, slot: null, event_type: "expand" });
    navigate(firstProduct?.id ? `/offers/${offer.id}/product/${firstProduct.id}` : `/offers/${offer.id}`);
  };


  return (
    <div ref={viewRef} className="relative rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
      <span className="absolute top-2 right-2 z-10 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
        Sponsored
      </span>

      {heroUrl && (
        <button
          type="button"
          onClick={openOffer}
          className="block w-full"
          aria-label={`View ${brand?.brand_name ?? "brand"} offer`}
        >
          <img
            src={heroUrl}
            alt={offer.headline ?? `${brand?.brand_name ?? "Brand"} offer`}
            loading="lazy"
            className="w-full h-[124px] object-cover"
          />
        </button>
      )}

      <div className="p-4 space-y-3">
        <div className="min-w-0 pr-14">
          <p className="font-display text-[16px] leading-tight">
            {brand?.brand_name ?? offer.headline ?? "Sponsored offer"}
          </p>
          {(brand?.brand_name ? offer.headline ?? brand?.category : brand?.category) && (
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
              {brand?.brand_name ? offer.headline ?? brand?.category : brand?.category}
            </p>
          )}
        </div>

        {offer.body_copy && (
          <p className="text-[12.5px] leading-snug font-body text-foreground/85">{offer.body_copy}</p>
        )}

        {offer.discount_code ? (
          <DiscountCodeChip
            code={offer.discount_code}
            variant="block"
            onCopy={() => logEvent.mutate({ offer_id: offer.id, slot: null, event_type: "code_copy" })}
          />
        ) : null}

        {left !== null && (
          <p className="flex items-center gap-1.5 text-[11px] font-body text-muted-foreground">
            <CalendarClock className="size-3.5 text-primary" />
            {left === 0 ? "Ends today" : left === 1 ? "1 day left" : `${left} days left`}
          </p>
        )}

        <Button variant="gold" size="pill" className="w-full gap-1.5" onClick={openOffer}>
          View offer <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </div>
  );

};


export default SponsoredOfferCard;
