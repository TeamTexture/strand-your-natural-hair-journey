import { useEffect, useState } from "react";
import { Eye, MousePointerClick, Heart, Ticket, ExternalLink, ChevronRight } from "lucide-react";
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
  id: string;
  headline: string | null;
  heroImagePath: string | null;
  slots: PlacementSlot[];
  startDate?: string;
  endDate?: string;
  totals?: Totals;
  hasPendingRevision?: boolean;
  revisionCount?: number;
  onReview: () => void;
}

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** Rich "live" advert thumbnail — hero image at top with pulsing LIVE chip,
 *  then five insight tiles (impressions, taps, code copies, link clicks,
 *  wishlist), a computed engagement rate, and an explicit Review button. */
const LiveOfferCard = ({
  headline,
  heroImagePath,
  slots,
  startDate,
  endDate,
  totals,
  hasPendingRevision,
  revisionCount,
  onReview,
}: Props) => {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!heroImagePath) {
      setHeroUrl(null);
      return;
    }
    supabase.storage
      .from("brand-assets")
      .createSignedUrl(heroImagePath, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setHeroUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [heroImagePath]);

  const impressions = totals?.impressions ?? 0;
  const taps = totals?.taps ?? 0;
  const codeCopies = totals?.code_copies ?? 0;
  const linkClicks = totals?.link_clicks ?? 0;
  const wishlist = totals?.wishlist_adds ?? 0;
  const engagement = impressions > 0 ? Math.round(((taps + codeCopies + linkClicks + wishlist) / impressions) * 1000) / 10 : 0;

  const slotSet = Array.from(new Set(slots));

  return (
    <div className="rounded-[16px] border border-primary/25 bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Hero thumbnail */}
      <div className="relative h-[92px] w-full bg-muted overflow-hidden">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {/* LIVE pulse chip */}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] font-body font-medium px-2 py-0.5 rounded-full bg-good/95 text-white">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-white" />
          </span>
          Live
        </span>
        {hasPendingRevision ? (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.14em] font-body font-medium px-2 py-0.5 rounded-full bg-warn/95 text-white">
            Changes under review
          </span>
        ) : revisionCount ? (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.14em] font-body font-medium px-2 py-0.5 rounded-full bg-black/50 text-white">
            Revised · {revisionCount}
          </span>
        ) : null}
        {/* Headline overlay */}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="font-display text-white text-[15px] leading-tight line-clamp-2 drop-shadow-sm">
            {headline || "Untitled advert"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {slotSet.slice(0, 3).map((s) => (
              <span key={s} className="text-[9px] uppercase tracking-wider font-body px-1.5 py-[1px] rounded bg-white/85 text-foreground/80">
                {SLOT_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Insight tiles */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body">Insights</p>
          <p className="text-[10px] font-body text-muted-foreground">
            {startDate ? `${format(new Date(startDate), "d MMM")}${endDate && endDate !== startDate ? ` – ${format(new Date(endDate), "d MMM")}` : ""}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <InsightTile icon={<Eye className="size-3.5" />} value={fmtNum(impressions)} label="Views" />
          <InsightTile icon={<MousePointerClick className="size-3.5" />} value={fmtNum(taps)} label="Taps" />
          <InsightTile icon={<Ticket className="size-3.5" />} value={fmtNum(codeCopies)} label="Codes" />
          <InsightTile icon={<ExternalLink className="size-3.5" />} value={fmtNum(linkClicks)} label="Clicks" />
          <InsightTile icon={<Heart className="size-3.5" />} value={fmtNum(wishlist)} label="Saves" />
        </div>
        <div className="mt-2.5 flex items-center justify-between rounded-[10px] bg-primary/5 border border-primary/15 px-2.5 py-1.5">
          <div className="min-w-0">
            <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">Engagement</p>
            <p className="font-display text-[15px] leading-none mt-0.5 text-foreground">{engagement}%</p>
          </div>
          <button
            type="button"
            onClick={onReview}
            className="inline-flex items-center gap-1 rounded-pill bg-primary text-primary-foreground text-[11.5px] font-body font-medium px-3 py-1.5"
          >
            Review <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const InsightTile = ({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) => (
  <div className="rounded-[10px] bg-muted/60 border border-border/60 px-1 py-1.5 flex flex-col items-center gap-0.5">
    <span className="text-muted-foreground">{icon}</span>
    <span className="font-display text-[13px] leading-none text-foreground">{value}</span>
    <span className="text-[8.5px] uppercase tracking-wider text-muted-foreground font-body">{label}</span>
  </div>
);

export default LiveOfferCard;
