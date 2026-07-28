import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Sparkles, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { supabase } from "@/integrations/supabase/client";

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

  return (
    <div className="relative rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
      <span className="absolute top-2 right-2 z-10 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
        Sponsored
      </span>

      {heroUrl && (
        <button
          type="button"
          onClick={() => navigate(`/offers/${offer.id}`)}
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

      <div className="p-4 space-y-2.5">
        <div className="flex items-start gap-3">
          <div className="size-11 rounded-[13px] bg-primary/15 text-primary flex items-center justify-center shrink-0 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={brand?.brand_name ?? "Brand logo"} className="size-full object-cover" />
            ) : (
              <Sparkles className="size-[18px]" />
            )}
          </div>
          <div className="min-w-0 flex-1 pr-14">
            {brand?.brand_name && (
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground leading-none mb-1">
                {brand.brand_name}
                {brand.category ? ` · ${brand.category}` : ""}
              </p>
            )}
            <p className="font-display text-[16px] leading-tight">{offer.headline}</p>
          </div>
        </div>

        {offer.body_copy && (
          <p className="text-[12px] text-muted-foreground leading-snug line-clamp-3">{offer.body_copy}</p>
        )}

        {offer.discount_code ? <DiscountCodeChip code={offer.discount_code} variant="block" /> : null}

        {left !== null && (
          <p className="flex items-center gap-1.5 text-[11px] font-body text-muted-foreground">
            <CalendarClock className="size-3.5 text-primary" />
            {left === 0 ? "Ends today" : left === 1 ? "1 day left" : `${left} days left`}
          </p>
        )}

        <Button
          variant="gold"
          size="pill"
          className="w-full gap-1.5"
          onClick={() => navigate(`/offers/${offer.id}`)}
        >
          View offer <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default SponsoredOfferCard;
