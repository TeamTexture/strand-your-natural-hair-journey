import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Check, X, Pause } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  useBrandOffer, STATUS_LABEL, SLOT_LABEL, PlacementSlot, deriveBrandOfferStatus,
  usePendingRevision, useApproveBrandOfferRevision, useRejectBrandOfferRevision,
  BrandOfferRevision,
} from "@/hooks/useBrandOffers";
import { useQueryClient } from "@tanstack/react-query";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const useSignedUrl = (path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url;
};

const cleanValue = (value: string | null | undefined) => (value ?? "").trim();

const ChangeField = ({ label, value }: { label: string; value: string | null | undefined }) => {
  return (
    <div className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5">
      <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">{label} changed to</p>
      <p className={`text-[12px] font-body leading-snug mt-1 ${cleanValue(value) ? "" : "text-muted-foreground italic"}`}>
        {cleanValue(value) || "Removed"}
      </p>
    </div>
  );
};

const arraysMatch = (a: unknown[] = [], b: unknown[] = []) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

const RevisionDiff = ({ offer, revision }: {
  offer: NonNullable<ReturnType<typeof useBrandOffer>["data"]>;
  revision: BrandOfferRevision;
}) => {
  const qc = useQueryClient();
  const approve = useApproveBrandOfferRevision();
  const reject = useRejectBrandOfferRevision();
  const [rejectReason, setRejectReason] = useState("");
  const afterHero = useSignedUrl(revision.hero_image_path ?? offer.hero_image_path);
  const heroChanged = (revision.hero_image_path ?? null) !== (offer.hero_image_path ?? null);
  const beforeProducts = offer.brand_products ?? [];
  const afterProducts = revision.products ?? [];
  const textChanges = [
    { label: "Headline", before: offer.headline, after: revision.headline },
    { label: "Body copy", before: offer.body_copy, after: revision.body_copy },
    { label: "Discount code", before: offer.discount_code, after: revision.discount_code },
    { label: "Advert link", before: offer.external_url, after: revision.external_url },
  ].filter((field) => cleanValue(field.before) !== cleanValue(field.after));
  const changedProducts = afterProducts.filter((product, index) => {
    const current = beforeProducts[index];
    if (!current) return true;
    return (
      cleanValue(current.name) !== cleanValue(product.name) ||
      cleanValue(current.description) !== cleanValue(product.description) ||
      cleanValue(current.external_url) !== cleanValue(product.external_url) ||
      !arraysMatch(current.image_urls ?? [], product.image_urls ?? []) ||
      !arraysMatch(current.ingredients ?? [], product.ingredients ?? []) ||
      cleanValue((current as typeof current & { tool_kind?: string | null }).tool_kind) !== cleanValue(product.tool_kind) ||
      !arraysMatch((current as typeof current & { key_features?: string[] | null }).key_features ?? [], product.key_features ?? []) ||
      !arraysMatch((current as typeof current & { materials?: string[] | null }).materials ?? [], product.materials ?? [])
    );
  });
  const productsChanged = changedProducts.length > 0 || beforeProducts.length !== afterProducts.length;
  const hasChanges = heroChanged || textChanges.length > 0 || productsChanged;

  return (
    <>
      <SurfaceCard className="bg-warn/5 border-warn/40 space-y-1">
        <p className="font-display text-[15px]">Pending revision</p>
        <p className="text-[11.5px] text-foreground/80 font-body leading-snug">
          Submitted {format(new Date(revision.submitted_at), "d MMM · HH:mm")}. Approve = new creative replaces what members see on next
          load. Reject = original creative continues running. No payment, dates unchanged, stats continue on the same offer.
        </p>
      </SurfaceCard>

      <SectionLabel className="!px-0">Changes made</SectionLabel>

      {!hasChanges && (
        <SurfaceCard className="py-2.5">
          <p className="text-[12px] text-muted-foreground font-body">No creative change was detected. Reject this revision or ask the brand to resubmit with updates.</p>
        </SurfaceCard>
      )}

      {heroChanged && (
        <div className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5">
          <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">Banner image changed to</p>
          {afterHero ? <img src={afterHero} alt="Updated advert banner" className="w-full aspect-[16/9] object-cover rounded mt-2" /> : <div className="aspect-[16/9] bg-muted rounded mt-2" />}
        </div>
      )}

      {textChanges.map((field) => (
        <ChangeField key={field.label} label={field.label} value={field.after} />
      ))}

      {productsChanged && (
        <>
          <SectionLabel className="!px-0">Attached products / tools changed to</SectionLabel>
          <SurfaceCard>
            <ul className="space-y-2">
              {afterProducts.length === 0 && <li className="text-[12px] text-muted-foreground italic">All attached products removed</li>}
              {afterProducts.map((p, i) => (
                <li key={`${p.name}-${i}`} className="text-[12px] font-body leading-snug">
                  <span className="font-medium">{p.name}</span>
                  {p.description && <span className="text-muted-foreground"> — {p.description}</span>}
                </li>
              ))}
            </ul>
          </SurfaceCard>
        </>
      )}

      <SectionLabel className="!px-0">Decision</SectionLabel>
      <div className="space-y-2">
        <Button
          variant="gold"
          size="pill"
          onClick={async () => {
            try {
              await approve.mutateAsync({ revision_id: revision.id, offer_id: offer.id });
              toast.success("Revision approved — creative updated");
              qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Approve failed");
            }
          }}
          className="w-full"
        >
          <Check className="size-4 mr-1.5" /> Approve revision
        </Button>
        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (shown to brand)" rows={2} />
        <Button
          variant="outline"
          size="pill"
          onClick={async () => {
            try {
              await reject.mutateAsync({ revision_id: revision.id, offer_id: offer.id, reason: rejectReason.trim() || null });
              toast.success("Revision rejected");
              qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
              setRejectReason("");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Reject failed");
            }
          }}
          className="w-full"
        >
          <X className="size-4 mr-1.5" /> Reject revision
        </Button>
      </div>
    </>
  );
};

const AdminBrandOfferReview = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const revisionMode = params.get("revision") !== null;
  const { data: offer, isLoading } = useBrandOffer(id);
  const { data: pendingRevision } = usePendingRevision(id);
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

  // If admin arrived from the "Pending revisions" queue OR a revision is
  // pending for this offer, prioritise the diff view.
  const showRevisionDiff = pendingRevision && (revisionMode || pendingRevision);

  return (
    <ScreenLayout>
      <TitleBar title={showRevisionDiff ? "Review revision" : "Review offer"} onBack={() => nav("/admin/brand-offers")} />
      <div className="px-5 pb-8 space-y-4">
        {showRevisionDiff ? (
          <RevisionDiff offer={offer} revision={pendingRevision!} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminBrandOfferReview;
