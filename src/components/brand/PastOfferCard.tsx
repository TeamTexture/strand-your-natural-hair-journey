import { useEffect, useState } from "react";
import { Eye, MousePointerClick, Heart, Ticket, ExternalLink, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SLOT_LABEL, type PlacementSlot } from "@/hooks/useBrandOffers";
import { format } from "date-fns";

interface Totals {
  impressions: number;
  taps: number;
  code_copies: number;
  link_clicks: number;
  wishlist_adds: number;
}

interface Props {
  headline: string | null;
  heroImagePath: string | null;
  slots: PlacementSlot[];
  startDate?: string;
  endDate?: string;
  totals?: Totals;
  submitter?: string | null;
  amountPaidPence?: number | null;
  interestTotal?: number;
  interestUnread?: number;
  onOpen: () => void;
}

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

/** "Ended" campaign thumbnail — mirrors LiveOfferCard's richness but muted:
 *  hero creative preserved, ENDED chip, campaign title, submitter, date range,
 *  placements, final stats, amount paid, plus an unread badge when new
 *  member interest has arrived since the owner last viewed. */
const PastOfferCard = ({
  headline,
  heroImagePath,
  slots,
  startDate,
  endDate,
  totals,
  submitter,
  amountPaidPence,
  interestTotal = 0,
  interestUnread = 0,
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

  const impressions = totals?.impressions ?? 0;
  const taps = totals?.taps ?? 0;
  const codeCopies = totals?.code_copies ?? 0;
  const linkClicks = totals?.link_clicks ?? 0;
  const wishlist = totals?.wishlist_adds ?? 0;

  const slotSet = Array.from(new Set(slots));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-[16px] border border-border/70 bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
    >
      {/* Hero — preserved after expiry, softened with grayscale + veil */}
      <div className="relative h-[92px] w-full bg-muted overflow-hidden">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover grayscale-[35%] opacity-90"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] font-body font-medium px-2 py-0.5 rounded-full bg-foreground/85 text-background">
          Ended
        </span>
        {interestUnread > 0 && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] font-body font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-70 animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
            </span>
            {interestUnread} new
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="font-display text-white text-[15px] leading-tight line-clamp-2 drop-shadow-sm">
            {headline || "Untitled campaign"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {slotSet.slice(0, 3).map((s) => (
              <span key={s} className="text-[9px] uppercase tracking-wider font-body px-1.5 py-[1px] rounded bg-white/80 text-foreground/80">
                {SLOT_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[11px] font-body text-foreground/70 truncate">
            {submitter ?? ""}
          </p>
          <p className="text-[10.5px] font-body text-muted-foreground shrink-0">
            {startDate ? `${format(new Date(startDate), "d MMM")}${endDate && endDate !== startDate ? ` – ${format(new Date(endDate), "d MMM")}` : ""}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <Tile icon={<Eye className="size-3.5" />} value={fmtNum(impressions)} label="Views" />
          <Tile icon={<MousePointerClick className="size-3.5" />} value={fmtNum(taps)} label="Taps" />
          <Tile icon={<Ticket className="size-3.5" />} value={fmtNum(codeCopies)} label="Codes" />
          <Tile icon={<ExternalLink className="size-3.5" />} value={fmtNum(linkClicks)} label="Clicks" />
          <Tile icon={<Heart className="size-3.5" />} value={fmtNum(wishlist)} label="Saves" />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] bg-muted/50 border border-border/60 px-2.5 py-1.5">
          <div className="min-w-0 flex items-center gap-2">
            {typeof amountPaidPence === "number" && (
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-body">Paid</p>
                <p className="font-display text-[13.5px] leading-none mt-0.5 text-foreground">{money(amountPaidPence)}</p>
              </div>
            )}
            {interestTotal > 0 && (
              <div className="pl-2 border-l border-border/60">
                <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-body inline-flex items-center gap-1">
                  <Users className="size-2.5" /> Interest
                </p>
                <p className="font-display text-[13.5px] leading-none mt-0.5 text-foreground">
                  {interestTotal}
                </p>
              </div>
            )}
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
};

const Tile = ({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) => (
  <div className="rounded-[10px] bg-muted/60 border border-border/60 px-1 py-1.5 flex flex-col items-center gap-0.5">
    <span className="text-muted-foreground">{icon}</span>
    <span className="font-display text-[13px] leading-none text-foreground">{value}</span>
    <span className="text-[8.5px] uppercase tracking-wider text-muted-foreground font-body">{label}</span>
  </div>
);

export default PastOfferCard;
