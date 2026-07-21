import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { CreditCard, Edit, Eye, MousePointerClick, Heart, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBrandOffer, STATUS_LABEL, SLOT_LABEL, PlacementSlot, useDeleteBrandOffer } from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const BrandOfferDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: offer, isLoading, refetch } = useBrandOffer(id);
  const [paying, setPaying] = useState(false);

  if (isLoading || !offer) return <LoadingDot />;

  const stats = (offer.brand_offer_stats ?? []).reduce(
    (acc, s) => ({
      impressions: acc.impressions + (s.impressions ?? 0),
      taps: acc.taps + (s.taps ?? 0),
      wishlist: acc.wishlist + (s.wishlist_adds ?? 0),
    }),
    { impressions: 0, taps: 0, wishlist: 0 },
  );

  const placements = offer.brand_offer_placements ?? [];
  const bySlot = placements.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.slot] = acc[p.slot] ?? []).push(p.placement_date);
    return acc;
  }, {});

  const canEdit = ["draft", "rejected"].includes(offer.status);
  const needsPayment = offer.status === "approved_unpaid";

  const startCheckout = async () => {
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("brand-checkout", {
        body: { offer_id: offer.id },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setPaying(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title={offer.headline} onBack={() => nav("/brand")} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="space-y-1">
          <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium">
            {STATUS_LABEL[offer.status]}
          </p>
          {offer.status === "rejected" && offer.rejection_reason && (
            <p className="text-[12px] text-destructive mt-1">{offer.rejection_reason}</p>
          )}
        </SurfaceCard>

        {needsPayment && (
          <SurfaceCard className="bg-primary/5 border-primary/40">
            <p className="font-display text-[15px]">Approved — complete payment to confirm your placement</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Total {money(offer.total_price_pence)}. Dates are held pending payment.
            </p>
            <Button variant="gold" size="pill" onClick={startCheckout} disabled={paying} className="mt-3 w-full">
              {paying ? <Loader2 className="size-4 animate-spin" /> : <><CreditCard className="size-4 mr-1.5" /> Complete payment</>}
            </Button>
          </SurfaceCard>
        )}

        <SectionLabel className="!px-0">Placements</SectionLabel>
        {Object.entries(bySlot).length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No placements selected.</p>
        ) : Object.entries(bySlot).map(([slot, dates]) => (
          <SurfaceCard key={slot} className="py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">
              {SLOT_LABEL[slot as PlacementSlot]}
            </p>
            <p className="text-[12px] mt-1">
              {dates.length} day{dates.length === 1 ? "" : "s"} · {format(new Date(dates.sort()[0]), "d MMM")}
              {dates.length > 1 && ` – ${format(new Date(dates[dates.length - 1]), "d MMM yyyy")}`}
            </p>
          </SurfaceCard>
        ))}

        <SectionLabel className="!px-0">Performance</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <StatBox icon={Eye} label="Impressions" value={stats.impressions} />
          <StatBox icon={MousePointerClick} label="Taps" value={stats.taps} />
          <StatBox icon={Heart} label="Wishlist" value={stats.wishlist} />
        </div>

        {(offer.brand_products ?? []).length > 0 && (
          <>
            <SectionLabel className="!px-0">Products</SectionLabel>
            {(offer.brand_products ?? []).map((p) => (
              <SurfaceCard key={p.id} className="py-2.5">
                <p className="font-display text-[14px] leading-tight">{p.name}</p>
                {p.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
              </SurfaceCard>
            ))}
          </>
        )}

        {canEdit && (
          <Button variant="outline" size="pill" onClick={() => nav(`/brand/offers/${offer.id}/edit`)} className="w-full">
            <Edit className="size-4 mr-1.5" /> Edit offer
          </Button>
        )}
      </div>
    </ScreenLayout>
  );
};

const StatBox = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) => (
  <SurfaceCard className="text-center py-3">
    <Icon className="size-4 text-primary mx-auto" />
    <p className="font-display text-xl mt-1">{value}</p>
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
  </SurfaceCard>
);

export default BrandOfferDetail;
