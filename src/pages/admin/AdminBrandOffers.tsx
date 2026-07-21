import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Check, X, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, SLOT_LABEL, PlacementSlot } from "@/hooks/useBrandOffers";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const AdminBrandOffers = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["admin", "brand-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("*, brand_profiles!brand_offers_brand_user_id_fkey(brand_name), brand_offer_placements(*), brand_products(id)")
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (error) {
        // Fallback if fk name differs; fetch without join.
        const alt = await supabase.from("brand_offers").select("*, brand_offer_placements(*), brand_products(id)").order("created_at", { ascending: false });
        return alt.data ?? [];
      }
      return data;
    },
  });

  const approve = async (id: string) => {
    const { error } = await supabase
      .from("brand_offers")
      .update({ status: "approved_unpaid", approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Approved — brand can now pay");
    qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
  };

  const reject = async () => {
    if (!rejectFor) return;
    const { error } = await supabase
      .from("brand_offers")
      .update({ status: "rejected", rejected_at: new Date().toISOString(), rejection_reason: rejectReason.trim() || null })
      .eq("id", rejectFor);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejectFor(null);
    setRejectReason("");
    qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
  };

  if (isLoading) return <LoadingDot />;

  const pending = offers.filter((o) => o.status === "under_review");
  const other = offers.filter((o) => o.status !== "under_review");

  return (
    <ScreenLayout>
      <TitleBar title="Brand offers" onBack={() => nav("/admin")} />
      <div className="px-5 pb-8 space-y-4">
        <Button variant="outline" size="pill" onClick={() => nav("/admin/brand-calendar")} className="w-full">
          <CalendarIcon className="size-4 mr-1.5" /> Booking calendar
        </Button>

        <SectionLabel className="!px-0">Pending review ({pending.length})</SectionLabel>
        {pending.length === 0 ? (
          <EmptyState icon="✦" message="No offers pending review." tone="card" />
        ) : pending.map((o) => (
          <SurfaceCard key={o.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-display text-[15px] leading-tight">{o.headline}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(o as { brand_profiles?: { brand_name?: string } | null }).brand_profiles?.brand_name ?? "Unknown brand"} · {money(o.total_price_pence)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from(new Set((o.brand_offer_placements ?? []).map((p) => p.slot))).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body">
                  {SLOT_LABEL[s as PlacementSlot]}
                </span>
              ))}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body">
                {(o.brand_offer_placements ?? []).length} days
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body">
                {(o.brand_products ?? []).length} product{(o.brand_products ?? []).length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="pill" onClick={() => nav(`/admin/brand-offers/${o.id}`)} className="flex-1 text-[12px]">
                Review
              </Button>
              <Button variant="gold" size="pill" onClick={() => approve(o.id)} className="flex-1 text-[12px]">
                <Check className="size-3.5 mr-1" /> Approve
              </Button>
              <Button variant="outline" size="pill" onClick={() => setRejectFor(o.id)} className="text-[12px]">
                <X className="size-3.5" />
              </Button>
            </div>
          </SurfaceCard>
        ))}

        <SectionLabel className="!px-0">All offers</SectionLabel>
        {other.map((o) => (
          <button key={o.id} onClick={() => nav(`/admin/brand-offers/${o.id}`)} className="w-full text-left">
            <SurfaceCard className="py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px] leading-tight truncate">{o.headline}</p>
                <p className="text-[10px] text-muted-foreground">
                  {STATUS_LABEL[o.status]} · {money(o.total_price_pence)}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </SurfaceCard>
          </button>
        ))}
      </div>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject offer</DialogTitle></DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (shown to brand)" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="gold" onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

export default AdminBrandOffers;
