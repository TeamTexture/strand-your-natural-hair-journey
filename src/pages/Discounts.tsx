import { smartBack } from "@/lib/smartBack";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, Flower2, HeartPulse, ExternalLink, Sparkles, Scissors } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { Button } from "@/components/ui/button";
import {
  HELLO_KLEAN_URL, HELLO_KLEAN_CODE,
} from "@/lib/discounts";
import { useAllLiveBrandOffers } from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";
import { directoryLinkForPro } from "@/lib/directoryLink";
import SponsoredOfferCard from "@/components/SponsoredOfferCard";
import LolaPeakInsightsCard from "@/components/blood/LolaPeakInsightsCard";
import BloodTestRoutesSheet from "@/components/blood/BloodTestRoutesSheet";


interface OfferProps {
  icon: React.ComponentType<{ className?: string }>;
  brand: string;
  tagline: string;
  blurb: string;
  code: string;
  url: string;
  cta: string;
  sponsored?: boolean;
}

const OfferCard = ({ icon: Icon, brand, tagline, blurb, code, url, cta, sponsored }: OfferProps) => {
  return (
    <div className="relative rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
      {sponsored && (
        <span className="absolute top-2 right-2 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
          Sponsored
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="size-11 rounded-[13px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 pr-14">
          <p className="font-display text-[16px] leading-tight">{brand}</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
            {tagline}
          </p>
        </div>
      </div>
      <p className="text-[12.5px] leading-snug font-body text-foreground/85">{blurb}</p>
      {code ? <DiscountCodeChip code={code} variant="block" /> : null}
      {url ? (
        <Button
          variant="gold"
          size="pill"
          className="w-full gap-1.5"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          {cta} <ExternalLink className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
};

/** Offers surfaced by professionals the member has accepted enquiries with,
 *  plus offers from any pro they've booked appointments with — sits above
 *  brand-paid slots so consented relationships lead. */
function useProOffersForConsumer() {
  return useQuery({
    queryKey: ["consumer-pro-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pro_offers")
        .select("id, title, description, code, pro_user_id, ends_at, starts_at, pro_profiles!inner(display_name)")
        .eq("is_active", true);
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).filter((o) =>
        (!o.starts_at || new Date(o.starts_at).getTime() <= now) &&
        (!o.ends_at || new Date(o.ends_at).getTime() >= now));
    },
  });
}

const Discounts = () => {
  const navigate = useNavigate();
  const { data: brandOffers } = useAllLiveBrandOffers();
  const { data: proOffers } = useProOffersForConsumer();
  const [routesOpen, setRoutesOpen] = useState(false);

  return (
    <ScreenLayout>
      <TitleBar title="Discounts & offers" onBack={smartBack(navigate, "/profile")} />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed">
          A growing set of partner discounts, unlocked as part of your STRAND membership. Tap a
          code to copy it, then apply it at checkout on the partner's site.
        </p>

        {(proOffers?.length ?? 0) > 0 && (
          <>
            <SectionLabel>From your professionals</SectionLabel>
            {proOffers!.map((o) => (
              <div key={o.id} className="space-y-2">
                <OfferCard
                  icon={Scissors}
                  brand={(o as { pro_profiles?: { display_name?: string } }).pro_profiles?.display_name ?? "STRAND Pro"}
                  tagline={o.title}
                  blurb={o.description ?? "Offer from a STRAND Council professional."}
                  code={o.code ?? ""}
                  url=""
                  cta=""
                />
                {o.pro_user_id && (
                  <Button
                    variant="outline"
                    size="pill"
                    className="w-full gap-1.5"
                    onClick={() => navigate(directoryLinkForPro(o.pro_user_id))}
                  >
                    View profile <ExternalLink className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </>
        )}

        {(brandOffers?.length ?? 0) > 0 && (
          <>
            <SectionLabel>Brand offers</SectionLabel>
            {brandOffers!.map((o) => (
              <SponsoredOfferCard key={o.id} offer={o} />
            ))}

          </>
        )}

        {/* Blood testing — the STRAND-recommended panel, shown as a standing
            member offer and as a route to booking a test. Single source of
            truth for the Lola copy, shared with the retest routes sheet. */}
        <SectionLabel>Blood testing</SectionLabel>
        <LolaPeakInsightsCard showHeading={false} showPrepNotes={false} />
        <Button
          variant="outline"
          size="pill"
          className="w-full gap-1.5"
          onClick={() => setRoutesOpen(true)}
        >
          <Droplets className="size-3.5" /> All ways to book a blood test
        </Button>

        {/*
          Hello Klean is hidden until the partnership is signed off. The code
          and URL stay in this file so the card can be switched back on — do
          not delete them.
        */}

        {(proOffers?.length ?? 0) === 0 && (brandOffers?.length ?? 0) === 0 && (
          <div className="rounded-[14px] border border-dashed border-border px-4 py-6 text-center">
            <p className="font-body text-[12.5px] text-foreground/75 leading-relaxed">
              No brand or professional offers just now. New partner discounts land here as they go
              live — we'll let you know when they do.
            </p>
          </div>
        )}

        <BloodTestRoutesSheet
          open={routesOpen}
          onOpenChange={setRoutesOpen}
          reason="Ways to get a blood test through STRAND."
        />




        <p className="text-[10.5px] font-body text-muted-foreground text-center pt-2">
          Discount codes are provided by partners and may change. If a code stops working, let us
          know at info@teamtexture.co.uk.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Discounts;
