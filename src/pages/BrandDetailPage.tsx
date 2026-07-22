import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";

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
          .select("id, headline, starts_on, ends_on")
          .eq("brand_user_id", brandUserId!)
          .eq("status", "ended")
          .order("ends_on", { ascending: false })
          .limit(10),
      ]);
      return { brand: brandRes.data, live: liveRes.data ?? [], past: pastRes.data ?? [] };
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
            <SectionLabel className="!px-0">Past offers</SectionLabel>
            <div className="space-y-2">
              {data!.past.map((o) => (
                <SurfaceCard key={o.id} className="opacity-75">
                  <p className="font-display text-[14px] leading-tight truncate">{o.headline || "Offer"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Ended {o.ends_on ? format(new Date(o.ends_on), "d MMM yyyy") : ""}
                  </p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandDetailPage;
