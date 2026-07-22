import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, Check, Heart } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyOfferInterest, useRegisterOfferInterest } from "@/hooks/useBrandOfferInterest";

interface PastOffer {
  id: string;
  headline: string | null;
  hero_image_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

const PastOfferRow = ({ offer }: { offer: PastOffer }) => {
  const { data: alreadyInterested } = useMyOfferInterest(offer.id);
  const register = useRegisterOfferInterest();
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!offer.hero_image_path) { setHeroUrl(null); return; }
    supabase.storage
      .from("brand-assets")
      .createSignedUrl(offer.hero_image_path, 60 * 60)
      .then(({ data }) => { if (!cancelled) setHeroUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [offer.hero_image_path]);

  return (
    <SurfaceCard className="p-0 overflow-hidden">
      <div className="relative h-[96px] w-full bg-muted">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover grayscale-[35%] opacity-90" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] font-body font-medium px-2 py-0.5 rounded-full bg-foreground/85 text-background">
          Expired
        </span>
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="font-display text-white text-[14px] leading-tight line-clamp-2 drop-shadow-sm">
            {offer.headline || "Offer"}
          </p>
        </div>
      </div>
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-body text-muted-foreground">
          Ended {offer.ends_on ? format(new Date(offer.ends_on), "d MMM yyyy") : ""}
        </p>
        {alreadyInterested ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-body text-good">
            <Check className="size-3.5" /> Interest registered
          </span>
        ) : (
          <Button
            variant="outline"
            size="pill"
            className="text-[11px] h-8"
            onClick={() => register.mutate(offer.id)}
            disabled={register.isPending}
          >
            <Heart className="size-3.5 mr-1" /> Show interest
          </Button>
        )}
      </div>
    </SurfaceCard>
  );
};

const BrandDetailPage = () => {
  const nav = useNavigate();
  const { brandUserId } = useParams();
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-detail", brandUserId],
    enabled: !!brandUserId,
    queryFn: async () => {
      const [brandRes, liveRes, pastRes] = await Promise.all([
        supabase
          .from("brand_profiles")
          .select("user_id, brand_name, category, about, website, logo_path")
          .eq("user_id", brandUserId!)
          .maybeSingle(),
        supabase
          .from("brand_offers")
          .select("id, headline, hero_image_path, starts_on, ends_on, status")
          .eq("brand_user_id", brandUserId!)
          .in("status", ["live", "paid_scheduled"])
          .lte("starts_on", today)
          .gte("ends_on", today)
          .order("starts_on"),
        supabase
          .from("brand_offers")
          .select("id, headline, hero_image_path, starts_on, ends_on")
          .eq("brand_user_id", brandUserId!)
          .eq("status", "ended")
          .order("ends_on", { ascending: false })
          .limit(10),
      ]);
      return {
        brand: brandRes.data,
        live: liveRes.data ?? [],
        past: (pastRes.data ?? []) as PastOffer[],
      };
    },
  });

  if (isLoading) return <LoadingDot />;

  const brand = data?.brand;
  if (!brand) {
    return (
      <ScreenLayout>
        <TitleBar title="Brand" onBack={() => nav(-1)} />
        <EmptyState icon="✦" message="Brand not found" />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title={brand.brand_name ?? "Brand"} onBack={() => nav(-1)} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard>
          <p className="font-display text-lg leading-tight">{brand.brand_name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {(brand as { category?: string | null }).category ?? "Brand"}
          </p>
          {(brand as { about?: string | null }).about && (
            <p className="mt-2 text-sm font-body text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {(brand as { about?: string | null }).about}
            </p>
          )}
          {brand.website && (
            <a
              href={brand.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[12px] font-body text-primary"
            >
              Visit website <ExternalLink className="size-3" />
            </a>
          )}
        </SurfaceCard>

        <div>
          <SectionLabel className="!px-0">Live offers</SectionLabel>
          {data!.live.length === 0 ? (
            <EmptyState icon="✦" message="No live offers right now" tone="card" />
          ) : (
            <div className="space-y-2">
              {data!.live.map((o) => (
                <SurfaceCard key={o.id} onClick={() => nav(`/offers/${o.id}`)} className="cursor-pointer hover:border-primary/50">
                  <p className="font-display text-[15px] leading-tight truncate">{o.headline || "Offer"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {o.starts_on ? format(new Date(o.starts_on), "d MMM") : ""}
                    {o.ends_on && o.ends_on !== o.starts_on ? ` – ${format(new Date(o.ends_on), "d MMM")}` : ""}
                  </p>
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>

        {data!.past.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Previous offers</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-2 leading-snug">
              Missed one? Tap Show interest and we'll let the brand know — they may run it again.
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {data!.past.map((o) => (
                <PastOfferRow key={o.id} offer={o} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandDetailPage;
