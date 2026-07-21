import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Check, X, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useBrandOffer, STATUS_LABEL, SLOT_LABEL, PlacementSlot, deriveBrandOfferStatus } from "@/hooks/useBrandOffers";
import { useQueryClient } from "@tanstack/react-query";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const AdminBrandOfferReview = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: offer, isLoading } = useBrandOffer(id);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (offer?.hero_image_path) {
      supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60).then(({ data }) => {
        setHeroUrl(data?.signedUrl ?? null);
      });
    }
  }, [offer?.hero_image_path]);

  if (isLoading || !offer) return <LoadingDot />;

  const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from("brand_offers").update({ status: status as never, ...extra }).eq("id", offer.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
    qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
  };

  const placements = offer.brand_offer_placements ?? [];
  const bySlot = placements.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.slot] = acc[p.slot] ?? []).push(p.placement_date);
    return acc;
  }, {});

  return (
    <ScreenLayout>
      <TitleBar title="Review offer" onBack={() => nav("/admin/brand-offers")} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard padded={false} className="overflow-hidden">
          {heroUrl && <img src={heroUrl} alt="" className="w-full aspect-[16/9] object-cover" />}
          <div className="p-3">
            <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium inline-flex items-center gap-1.5">{deriveBrandOfferStatus(offer) === "live" && (<span className="relative flex size-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-70 animate-ping" /><span className="relative inline-flex size-1.5 rounded-full bg-good" /></span>)}{STATUS_LABEL[deriveBrandOfferStatus(offer)]}</p>
            <p className="font-display text-lg mt-1">{offer.headline}</p>
            {offer.body_copy && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{offer.body_copy}</p>}
            {offer.discount_code && <p className="text-[11px] text-primary mt-2 font-body">Code {offer.discount_code}</p>}
            {offer.external_url && <p className="text-[11px] text-muted-foreground mt-1 break-all">{offer.external_url}</p>}
          </div>
        </SurfaceCard>

        <SurfaceCard className="py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total value</p>
          <p className="font-display text-xl">{money(offer.total_price_pence)}</p>
        </SurfaceCard>

        <SectionLabel className="!px-0">Placements</SectionLabel>
        {Object.entries(bySlot).map(([slot, dates]) => (
          <SurfaceCard key={slot} className="py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{SLOT_LABEL[slot as PlacementSlot]}</p>
            <p className="text-[12px] mt-0.5">
              {dates.length} day{dates.length === 1 ? "" : "s"} · {format(new Date(dates.sort()[0]), "d MMM yyyy")}
            </p>
          </SurfaceCard>
        ))}

        {(offer.brand_products ?? []).length > 0 && (
          <>
            <SectionLabel className="!px-0">Products &amp; AI drafts</SectionLabel>
            {(offer.brand_products ?? []).map((p) => (
              <SurfaceCard key={p.id} className="space-y-1">
                <p className="font-display text-[14px]">{p.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {p.source_type === "ai" ? "AI-drafted from " + (p.source_url ?? "URL") : p.source_type}
                </p>
                {p.description && <p className="text-[12px] text-muted-foreground leading-snug">{p.description}</p>}
                {p.ingredients && p.ingredients.length > 0 && (
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    <span className="uppercase tracking-wider">Ingredients:</span> {p.ingredients.slice(0, 8).join(", ")}
                    {p.ingredients.length > 8 && "…"}
                  </p>
                )}
              </SurfaceCard>
            ))}
          </>
        )}

        <SectionLabel className="!px-0">Actions</SectionLabel>
        {offer.status === "under_review" && (
          <div className="space-y-2">
            <Button variant="gold" size="pill" onClick={() => setStatus("approved_unpaid", { approved_at: new Date().toISOString() })} className="w-full">
              <Check className="size-4 mr-1.5" /> Approve
            </Button>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (shown to brand)" rows={2} />
            <Button variant="outline" size="pill" onClick={() => setStatus("rejected", { rejected_at: new Date().toISOString(), rejection_reason: rejectReason.trim() || null })} className="w-full">
              <X className="size-4 mr-1.5" /> Reject
            </Button>
          </div>
        )}
        {["paid_scheduled", "live"].includes(offer.status) && (
          <Button variant="outline" size="pill" onClick={() => setStatus("ended", { ends_on: new Date().toISOString().slice(0, 10) })} className="w-full">
            <Pause className="size-4 mr-1.5" /> End early
          </Button>
        )}
        {offer.status === "approved_unpaid" && (
          <Button variant="outline" size="pill" onClick={() => setStatus("cancelled")} className="w-full">
            Cancel (release dates)
          </Button>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminBrandOfferReview;
