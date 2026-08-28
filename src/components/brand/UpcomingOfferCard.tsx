import { useEffect, useState } from "react";
import { Eye, Maximize2, Heart, Ticket, ExternalLink, ChevronRight, CreditCard, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SLOT_LABEL, type PlacementSlot } from "@/hooks/useBrandOffers";
import { format } from "date-fns";
import { money as baseMoney } from "@/lib/adPricing";
import TrialPriceTag from "@/components/brand/TrialPriceTag";

interface Props {
  headline: string | null;
  heroImagePath: string | null;
  slots: PlacementSlot[];
  startDate?: string;
  endDate?: string;
  /** "approved_unpaid" | "upcoming" — drives the chip and footer line. */
  state: "approved_unpaid" | "upcoming";
  submitter?: string | null;
  pricePence?: number | null;
  productCount?: number;
  revisionCount?: number;
  hasPendingRevision?: boolean;
  /** Right-hand action label, e.g. "Review" for admin or "Pay" for the brand. */
  actionLabel?: string;
  onOpen: () => void;
}

const money = baseMoney;


/** Scheduled / awaiting-payment advert thumbnail. Same shape and richness as the
 *  live and ended cards so a future campaign reads as a finished advert before a
 *  single penny is taken — hero creative, headline, placements, submitter and the
 *  insight tiles sitting at zero, ready to fill. */
const UpcomingOfferCard = ({
  headline,
  heroImagePath,
  slots,
  startDate,
  endDate,
  state,
  submitter,
  pricePence,
  productCount = 0,
  revisionCount,
  hasPendingRevision,
  actionLabel = "Review",
  onOpen,
}: Props) => {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!heroImagePath) { setHeroUrl(null); return; }
    supabase.storage
      .from("brand-assets")
      .createSignedUrl(heroImagePath, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setHeroUrl(data?.signedUrl ?? null);
      });
    return () => { cancelled = true; };
  }, [heroImagePath]);

  const slotSet = Array.from(new Set(slots));
  const unpaid = state === "approved_unpaid";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-[16px] border bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
        unpaid ? "border-primary/30" : "border-border/70"
      }`}
    >
      <div className="relative h-[92px] w-full bg-muted overflow-hidden">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <span
          className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] font-body font-medium px-2 py-0.5 rounded-full ${
            unpaid ? "bg-primary/95 text-primary-foreground" : "bg-foreground/85 text-background"
          }`}
        >
          {unpaid ? <CreditCard className="size-2.5" /> : <CalendarClock className="size-2.5" />}
          {unpaid ? "Payment required" : "Scheduled"}
        </span>
        {hasPendingRevision ? (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.14em] font-body font-medium px-2 py-0.5 rounded-full bg-warn/95 text-background">
            Changes under review
          </span>
        ) : revisionCount ? (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.14em] font-body font-medium px-2 py-0.5 rounded-full bg-black/50 text-background">
            Revised · {revisionCount}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="font-display text-background text-[15px] leading-tight break-words drop-shadow-sm">
            {headline || "Untitled campaign"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {slotSet.slice(0, 3).map((s) => (
              <span key={s} className="text-[9px] uppercase tracking-wider font-body px-1.5 py-[1px] rounded bg-background/85 text-foreground/80">
                {SLOT_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
          <p className="text-[11px] font-body text-foreground/70 break-words min-w-0">
            {submitter ?? ""}
            {productCount > 0 ? ` · ${productCount} product${productCount === 1 ? "" : "s"}` : ""}
          </p>
          <p className="text-[10.5px] font-body text-muted-foreground shrink-0">
            {startDate
              ? `${format(new Date(startDate), "d MMM")}${endDate && endDate !== startDate ? ` – ${format(new Date(endDate), "d MMM")}` : ""}`
              : "No dates yet"}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1.5 opacity-70">
          <Tile icon={<Eye className="size-3.5" />} label="Views" />
          <Tile icon={<Maximize2 className="size-3.5" />} label="Expands" />
          <Tile icon={<Ticket className="size-3.5" />} label="Codes" />
          <Tile icon={<ExternalLink className="size-3.5" />} label="Clicks" />
          <Tile icon={<Heart className="size-3.5" />} label="Saves" />
        </div>
        <div
          className={`mt-2.5 flex items-center justify-between gap-2 rounded-[10px] border px-2.5 py-1.5 ${
            unpaid ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-border/60"
          }`}
        >
          <div className="min-w-0">
            <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-body">
              {unpaid ? "Awaiting payment" : "Paid · starts soon"}
            </p>
            <p className="font-display text-[13.5px] leading-none mt-0.5 text-foreground flex items-center gap-1.5">
              <span>{typeof pricePence === "number" ? money(pricePence) : "—"}</span>
              <TrialPriceTag />
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-pill text-[11.5px] font-body font-medium px-3 py-1.5 shrink-0 ${
              unpaid ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80"
            }`}
          >
            {actionLabel} <ChevronRight className="size-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
};

const Tile = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="rounded-[10px] bg-muted/60 border border-border/60 px-1 py-1.5 flex flex-col items-center gap-0.5">
    <span className="text-muted-foreground">{icon}</span>
    <span className="font-display text-[13px] leading-none text-muted-foreground">0</span>
    <span className="text-[8.5px] uppercase tracking-wider text-muted-foreground font-body">{label}</span>
  </div>
);

export default UpcomingOfferCard;
