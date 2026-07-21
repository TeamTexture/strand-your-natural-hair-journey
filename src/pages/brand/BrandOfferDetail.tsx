import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { CreditCard, Edit, Eye, MousePointerClick, Heart, Loader2, Trash2, Ticket, ExternalLink, Clock, XCircle, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import CountdownClock from "@/components/brand/CountdownClock";
import { useOwnerMode, ownerHomeRoute, ownerOfferRoute } from "@/hooks/useOwnerMode";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const BrandOfferDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const ownerMode = useOwnerMode();
  const homeRoute = ownerHomeRoute(ownerMode);
  const editRoute = (oid: string) => `${ownerOfferRoute(ownerMode, oid)}/edit`;
  const { data: offer, isLoading } = useBrandOffer(id);
  const { data: pendingRevision } = usePendingRevision(id);
  const { data: allRevisions = [] } = useOfferRevisions(id);
  const withdrawRevision = useWithdrawBrandOfferRevision();
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroOpen, setHeroOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const deleteOffer = useDeleteBrandOffer();

  useEffect(() => {
    if (!offer?.hero_image_path) { setHeroUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60)
      .then(({ data }) => { if (!cancelled) setHeroUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [offer?.hero_image_path]);

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
      <TitleBar title={offer.headline ?? "Offer"} onBack={() => nav("/brand")} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium inline-flex items-center gap-1.5">
              {derived === "live" && (
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-70 animate-ping" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-good" />
                </span>
              )}
              {STATUS_LABEL[derived]}
            </p>
            {(derived === "live" || derived === "upcoming") && (
              <CountdownClock offer={offer} />
            )}
          </div>
          {(derived === "live" || derived === "upcoming") && (
            <CountdownClock offer={offer} variant="block" />
          )}
          {offer.status === "rejected" && offer.rejection_reason && (
            <p className="text-[12px] text-destructive mt-1">{offer.rejection_reason}</p>
          )}
        </SurfaceCard>

        {heroUrl && (
          <button
            type="button"
            onClick={() => setHeroOpen(true)}
            className="group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/30"
            aria-label="View full banner graphic"
          >
            <img
              src={heroUrl}
              alt={offer.headline ?? "Offer banner"}
              className="w-full h-auto object-cover aspect-[1500/320] block"
              loading="lazy"
            />
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-body text-foreground/80 shadow-sm">
              <Maximize2 className="size-3" /> Tap to view full
            </span>
          </button>
        )}

        {offer.external_url && (
          <SurfaceCard className="py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">Advert link</p>
            <a
              href={offer.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-primary font-body break-all hover:underline"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              <span className="break-all">{offer.external_url}</span>
            </a>
          </SurfaceCard>
        )}



        {pendingRevision && (
          <SurfaceCard className="bg-warn/5 border-warn/40">
            <div className="flex items-start gap-2.5">
              <Clock className="size-4 text-warn mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px]">Changes under review</p>
                <p className="text-[11.5px] text-muted-foreground font-body mt-0.5 leading-snug">
                  Your original creative is still running to members. When the admin approves your edit, the banner updates on next load —
                  the date window, placements and stats stay the same. No new payment.
                </p>
                <p className="text-[10.5px] text-muted-foreground font-body mt-1">
                  Submitted {format(new Date(pendingRevision.submitted_at), "d MMM · HH:mm")}
                </p>
                <div className="flex gap-1.5 mt-2">
                  <Button variant="outline" size="pill" onClick={() => nav(`/brand/offers/${offer.id}/edit`)} className="flex-1 text-[11px]">
                    Update changes
                  </Button>
                  <Button
                    variant="outline"
                    size="pill"
                    onClick={() => setConfirmWithdraw(true)}
                    disabled={withdrawRevision.isPending}
                    className="flex-1 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    Withdraw
                  </Button>
                </div>
              </div>
            </div>
          </SurfaceCard>
        )}

        {!pendingRevision && lastRejectedRevision?.rejection_reason && (
          <SurfaceCard className="bg-destructive/5 border-destructive/30">
            <div className="flex items-start gap-2.5">
              <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px]">Last edit rejected</p>
                <p className="text-[11.5px] text-foreground/80 font-body mt-0.5 leading-snug">
                  {lastRejectedRevision.rejection_reason}
                </p>
                <p className="text-[10.5px] text-muted-foreground font-body mt-1">
                  Your original creative is still running. You can submit new changes any time.
                </p>
              </div>
            </div>
          </SurfaceCard>
        )}

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

        {allRevisions.length > 0 && (
          <>
            <SectionLabel className="!px-0">Revision history ({allRevisions.length})</SectionLabel>
            {allRevisions.map((r) => {
              const tone =
                r.status === "pending" ? "bg-warn/15 text-warn"
                  : r.status === "approved" ? "bg-good/15 text-good"
                    : r.status === "rejected" ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground";
              const label =
                r.status === "pending" ? "Under review"
                  : r.status === "approved" ? "Approved"
                    : r.status === "rejected" ? "Rejected"
                      : r.status === "withdrawn" ? "Withdrawn"
                        : r.status === "superseded" ? "Superseded"
                          : r.status;
              const stamp = r.reviewed_at ?? r.submitted_at;
              return (
                <SurfaceCard key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-[13px] leading-tight truncate">
                      {r.headline?.trim() || <span className="italic text-muted-foreground">No headline</span>}
                    </p>
                    <span className={`text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full font-body font-medium ${tone}`}>
                      {label}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground font-body mt-0.5">
                    Submitted {format(new Date(r.submitted_at), "d MMM yyyy · HH:mm")}
                    {r.reviewed_at && r.status !== "pending" && (
                      <> · {label.toLowerCase()} {format(new Date(stamp!), "d MMM · HH:mm")}</>
                    )}
                  </p>
                  {r.rejection_reason && (
                    <p className="text-[11px] text-destructive font-body mt-1 leading-snug">{r.rejection_reason}</p>
                  )}
                </SurfaceCard>
              );
            })}
          </>
        )}


        {(offer.brand_products ?? []).length > 0 && (
          <>
            <SectionLabel className="!px-0">Products</SectionLabel>
            {(offer.brand_products ?? []).map((p) => {
              const thumb = (p.image_urls ?? [])[0];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProductId(p.id)}
                  className="w-full text-left"
                >
                  <SurfaceCard className="py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                    {thumb ? (
                      <img src={thumb} alt={p.name} className="size-12 rounded-md object-cover flex-none bg-muted" />
                    ) : (
                      <div className="size-12 rounded-md bg-muted flex-none" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[14px] leading-tight truncate">{p.name}</p>
                      {p.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                    </div>
                    <Eye className="size-4 text-muted-foreground flex-none" />
                  </SurfaceCard>
                </button>
              );
            })}
          </>
        )}


        {canEdit && !pendingRevision && (
          <Button variant="outline" size="pill" onClick={() => nav(`/brand/offers/${offer.id}/edit`)} className="w-full">
            <Edit className="size-4 mr-1.5" />
            {isRevisionMode ? "Edit creative (submits for review)" : "Edit offer"}
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
      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw these changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your original creative will keep running to members unchanged. You can submit a new edit at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep pending</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingRevision) return;
                try {
                  await withdrawRevision.mutateAsync({ revision_id: pendingRevision.id, offer_id: offer.id });
                  toast.success("Changes withdrawn");
                  setConfirmWithdraw(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Withdraw failed");
                }
              }}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={heroOpen} onOpenChange={setHeroOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[720px] p-2 bg-background">
          {heroUrl && (
            <img src={heroUrl} alt={offer.headline ?? "Offer banner"} className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
      <ProductInfoDialog
        product={(offer.brand_products ?? []).find((p) => p.id === activeProductId) ?? null}
        onClose={() => setActiveProductId(null)}
      />
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

type BrandProductRow = NonNullable<ReturnType<typeof useBrandOffer>["data"]>["brand_products"][number];

const ProductInfoDialog = ({ product, onClose }: { product: BrandProductRow | null; onClose: () => void }) => {
  const open = !!product;
  const images = product?.image_urls ?? [];
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-[520px] max-h-[85vh] overflow-y-auto p-4 bg-background">
        {product && (
          <div className="space-y-3">
            {images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
                {images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`${product.name} ${i + 1}`}
                    className="size-32 rounded-lg object-cover flex-none bg-muted"
                  />
                ))}
              </div>
            )}
            <div>
              <p className="font-display text-lg leading-tight">{product.name}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {product.kind === "tool" ? (product.tool_kind ?? "Tool") : "Product"}
              </p>
            </div>
            {product.description && (
              <p className="text-[13px] text-foreground/80 whitespace-pre-wrap">{product.description}</p>
            )}
            {product.key_features?.length > 0 && (
              <div>
                <SectionLabel className="!px-0">Key features</SectionLabel>
                <ul className="mt-1 space-y-1 text-[13px] list-disc pl-4">
                  {product.key_features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
            {product.materials?.length > 0 && (
              <div>
                <SectionLabel className="!px-0">Materials</SectionLabel>
                <p className="text-[13px] mt-1">{product.materials.join(", ")}</p>
              </div>
            )}
            {product.ingredients && product.ingredients.length > 0 && (
              <div>
                <SectionLabel className="!px-0">Ingredients</SectionLabel>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{product.ingredients.join(", ")}</p>
              </div>
            )}
            {product.external_url && (
              <Button
                asChild
                variant="outline"
                size="pill"
                className="w-full"
              >
                <a href={product.external_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 mr-1.5" /> Visit product page
                </a>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BrandOfferDetail;

