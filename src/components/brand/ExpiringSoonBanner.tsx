import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Zap } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { buildCountdown, formatCountdown, getOfferExpiry } from "@/lib/offerExpiry";
import type { BrandOffer, BrandPlacement } from "@/hooks/useBrandOffers";

type OfferWithPlacements = BrandOffer & { brand_offer_placements?: BrandPlacement[] | null };

interface Props {
  offers: OfferWithPlacements[];
  /** Tick prop from parent (Date.now) so this stays in sync without owning its own timer. */
  now: Date;
}

/** Banner shown at top of the brand dashboard when any live offer will expire
 *  in ≤3 hours. Offers Extend / Create new as next steps. */
const ExpiringSoonBanner = ({ offers, now }: Props) => {
  const nav = useNavigate();
  const expiring = useMemo(() => {
    return offers
      .map((o) => {
        const expiry = getOfferExpiry(o);
        const c = buildCountdown(expiry, now);
        return c && c.soon ? { offer: o, countdown: c } : null;
      })
      .filter((x): x is { offer: OfferWithPlacements; countdown: NonNullable<ReturnType<typeof buildCountdown>> } => !!x)
      .sort((a, b) => a.countdown.ms - b.countdown.ms);
  }, [offers, now]);

  if (expiring.length === 0) return null;

  const first = expiring[0];
  const multi = expiring.length > 1;

  return (
    <SurfaceCard className="border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className="size-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <AlertTriangle className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[14.5px] leading-tight text-destructive">
            {multi
              ? `${expiring.length} offers about to expire`
              : "Your offer is about to expire"}
          </p>
          <p className="text-[11.5px] text-foreground/80 font-body leading-snug mt-0.5">
            <span className="font-medium">{first.offer.headline ?? "Untitled offer"}</span> —{" "}
            <span className="text-destructive font-medium">{formatCountdown(first.countdown)}</span>
            . Once it ends, the banner comes down across the app. Extend the run or launch a fresh offer to stay in front of members.
          </p>
        </div>
      </div>

      {multi && (
        <ul className="text-[11px] font-body text-foreground/70 pl-11 space-y-0.5">
          {expiring.slice(1, 3).map(({ offer, countdown }) => (
            <li key={offer.id} className="truncate">
              · {offer.headline ?? "Untitled offer"} — <span className="text-destructive font-medium">{formatCountdown(countdown)}</span>
            </li>
          ))}
          {expiring.length > 3 && (
            <li className="text-muted-foreground">· +{expiring.length - 3} more</li>
          )}
        </ul>
      )}

      <div className="flex flex-col gap-2 w-full">
        <Button
          variant="gold"
          size="pill"
          onClick={() => nav(`/brand/offers/${first.offer.id}/extend`)}
          className="w-full text-[11.5px] uppercase tracking-[0.08em]"
        >
          <Zap className="size-3.5 mr-1.5" /> EXTEND IT
        </Button>
        <Button
          variant="gold"
          size="pill"
          onClick={() => nav("/brand/offers/new")}
          className="w-full text-[11.5px] uppercase tracking-[0.08em]"
        >
          <Plus className="size-3.5 mr-1.5" /> NEW OFFER
        </Button>
      </div>
    </SurfaceCard>
  );
};

export default ExpiringSoonBanner;
