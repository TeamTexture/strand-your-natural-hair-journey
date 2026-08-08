import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { smartBack } from "@/lib/smartBack";
import { supabase } from "@/integrations/supabase/client";
import SponsoredWashDayTipCard from "@/components/washday/SponsoredWashDayTipCard";
import { SLOT_LABEL, type PlacementSlot } from "@/hooks/useBrandOffers";

/**
 * AdminSponsoredTipPreview — review surface for Card 2 (the sponsored wash day
 * tip).
 *
 * Card 2 only appears to a member who consented to personalised offers AND
 * matched a live wash-day campaign, which made it impossible to review before
 * launch. This page renders the real component in preview mode: consent and
 * delivery matching are bypassed, and NO `ad_events` are written, so reviewing
 * a campaign can never inflate a brand's impressions, expands or clicks.
 */
const AdminSponsoredTipPreview = () => {
  const nav = useNavigate();
  const { offerId } = useParams<{ offerId?: string }>();
  const [params] = useSearchParams();
  const explicitId = offerId ?? params.get("offer") ?? undefined;

  const { data: offers } = useQuery({
    queryKey: ["admin-sponsored-preview-offers"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_offers")
        .select(
          "id, headline, status, starts_on, ends_on, brand_offer_placements(slot), brand_offer_products(brand_product_id)",
        )
        .order("created_at", { ascending: false })
        .limit(40);
      return (data ?? []).filter(
        (o) => (o as { brand_offer_products?: unknown[] }).brand_offer_products?.length,
      );
    },
  });

  const list = useMemo(() => offers ?? [], [offers]);

  return (
    <ScreenLayout>
      <TitleBar title="Sponsored tip preview" onBack={() => smartBack(nav, "/admin/brand-offers")} />

      <SurfaceCard className="p-3.5">
        <p className="text-[12px] leading-[1.55] font-body text-muted-foreground">
          This is Card 2 exactly as a matched member sees it on the wash day screen,
          in the brand's own colours. Nothing here is logged — impressions, expands,
          code copies and clicks are all suppressed in preview.
        </p>
      </SurfaceCard>

      <div className="mt-4">
        <SectionLabel>Preview</SectionLabel>
        <div className="mt-2">
          <SponsoredWashDayTipCard preview previewOfferId={explicitId} />
        </div>
      </div>

      {list.length > 0 && (
        <div className="mt-5">
          <SectionLabel>Campaigns with a product attached</SectionLabel>
          <div className="mt-2 space-y-1.5">
            {list.map((o) => {
              const slots = ((o as { brand_offer_placements?: Array<{ slot: PlacementSlot }> })
                .brand_offer_placements ?? []).map((p) => SLOT_LABEL[p.slot]).join(", ");
              const active = explicitId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => nav(`/admin/sponsored-tip-preview/${o.id}`)}
                  className={`w-full text-left rounded-[12px] border px-3 py-2.5 min-h-[44px] ${
                    active ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <p className="font-body text-[13px] text-foreground">
                    {o.headline || "Untitled campaign"}
                  </p>
                  <p className="font-body text-[11px] text-muted-foreground">
                    {slots || "No placement"} · {String(o.status).replace(/_/g, " ")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </ScreenLayout>
  );
};

export default AdminSponsoredTipPreview;
