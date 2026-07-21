import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { CreditCard, Edit, Eye, MousePointerClick, Heart, Loader2, Trash2, Ticket, ExternalLink, Clock, XCircle } from "lucide-react";
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
import {
  useBrandOffer, STATUS_LABEL, SLOT_LABEL, PlacementSlot, useDeleteBrandOffer, deriveBrandOfferStatus,
  usePendingRevision, useOfferRevisions, useWithdrawBrandOfferRevision,
} from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const BrandOfferDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: offer, isLoading } = useBrandOffer(id);
  const { data: pendingRevision } = usePendingRevision(id);
  const { data: allRevisions = [] } = useOfferRevisions(id);
  const withdrawRevision = useWithdrawBrandOfferRevision();
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const deleteOffer = useDeleteBrandOffer();

  if (isLoading || !offer) return <LoadingDot />;

  const stats = (offer.brand_offer_stats ?? []).reduce(
    (acc, s) => ({
      impressions: acc.impressions + (s.impressions ?? 0),
      taps: acc.taps + (s.taps ?? 0),
      wishlist: acc.wishlist + (s.wishlist_adds ?? 0),
      codeCopies: acc.codeCopies + ((s as { code_copies?: number }).code_copies ?? 0),
      linkClicks: acc.linkClicks + ((s as { link_clicks?: number }).link_clicks ?? 0),
    }),
    { impressions: 0, taps: 0, wishlist: 0, codeCopies: 0, linkClicks: 0 },
  );

  const placements = offer.brand_offer_placements ?? [];
  const bySlot = placements.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.slot] = acc[p.slot] ?? []).push(p.placement_date);
    return acc;
  }, {});

  const derived = deriveBrandOfferStatus(offer);
  // Live / paid-scheduled offers can be edited too — via the revision flow (no re-payment).
  const canEdit = ["draft", "rejected", "under_review", "paid_scheduled", "live"].includes(offer.status);
  const isRevisionMode = ["paid_scheduled", "live"].includes(offer.status);
  const needsPayment = offer.status === "approved_unpaid";
  // Brands can pull an offer any time BEFORE it's paid/live — including while under review.
  // Live/paid campaigns must be ended, not deleted, so they aren't listed here.
  const canDelete = !["paid_scheduled", "live"].includes(offer.status) && derived !== "live";
  // Most-recent rejected revision (so the brand can see the admin's note).
  const lastRejectedRevision = allRevisions.find((r) => r.status === "rejected");

  const handleDelete = async () => {
    try {
      await deleteOffer.mutateAsync(offer.id);
      toast.success("Offer deleted");
      nav("/brand");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

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
          <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium inline-flex items-center gap-1.5">
            {derived === "live" && (
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-70 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-good" />
              </span>
            )}
            {STATUS_LABEL[derived]}
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
          <StatBox icon={Ticket} label="Code copies" value={stats.codeCopies} />
          <StatBox icon={ExternalLink} label="Link clicks" value={stats.linkClicks} />
          <StatBox icon={Heart} label="Wishlist" value={stats.wishlist} />
        </div>
        <p className="text-[10.5px] text-muted-foreground font-body -mt-1 leading-snug">
          Taps = banner opened. Code copies = discount code copied. Link clicks = tapped through to your site.
        </p>

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

        {canDelete && (
          <Button
            variant="outline"
            size="pill"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteOffer.isPending}
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <Trash2 className="size-4 mr-1.5" /> Delete offer
          </Button>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              {offer.status === "under_review"
                ? "This will withdraw the offer from admin review and permanently remove all the copy, images, products and placement dates you added."
                : "This permanently removes the offer copy, images, products and any selected placement dates. You can't undo this."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep offer</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
