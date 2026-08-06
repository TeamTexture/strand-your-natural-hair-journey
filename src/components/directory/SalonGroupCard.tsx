import { ChevronDown, MapPin, Scissors, Tag } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import StarRating from "@/components/StarRating";
import { cn } from "@/lib/utils";
import type { Professional } from "@/data/professionals";
import type { ReviewSummary } from "@/hooks/useReviews";

/** A directory result row: either one listing, or one salon's roster. */
export type DirectoryRow =
  | { kind: "solo"; pro: Professional }
  | {
      kind: "salon";
      salonId: string;
      salonName: string;
      city: string | null;
      /** Every published stylist in the salon. */
      roster: Professional[];
      /** The subset that survived the member's current filters/search. */
      matched: Professional[];
    };

interface Props {
  salonId: string;
  salonName: string;
  city: string | null;
  roster: Professional[];
  matched: Professional[];
  /** True when a search/category/capability filter is narrowing the list. */
  filterActive: boolean;
  ratingFor: (pro: Professional) => ReviewSummary | null | undefined;
  open: boolean;
  onToggle: () => void;
  renderStylist: (pro: Professional) => React.ReactNode;
}

/**
 * Collapsed salon card.
 *
 * Two rules do real work here:
 *  • Discount CODES never appear collapsed. Three codes stacked on one card is
 *    noise and members can't tell which stylist each belongs to — so collapsed
 *    says only that discounts exist, and the codes appear per stylist on expand.
 *  • When a filter is active the card NAMES the stylist that matched. Without
 *    that, a member filtering by "Colourist" expands into three stylists with no
 *    idea which one the result was for, and the filter reads as broken.
 *
 * Reviews belong to the stylist, never the salon. The salon-level figure shown
 * here is a count-weighted average of its stylists' approved reviews, and is
 * omitted entirely when no stylist has any.
 */
const SalonGroupCard = ({
  salonName,
  city,
  roster,
  matched,
  filterActive,
  ratingFor,
  open,
  onToggle,
  renderStylist,
}: Props) => {
  const specialisms = Array.from(
    new Set(roster.flatMap((p) => p.specs ?? []).filter((s) => s.trim().length > 0)),
  );
  const shownSpecs = specialisms.slice(0, 6);
  const extraSpecs = specialisms.length - shownSpecs.length;

  const anyDiscount = roster.some((p) => (p.discount ?? "").trim().length > 0);

  const summaries = roster
    .map((p) => ratingFor(p))
    .filter((r): r is ReviewSummary => !!r && r.review_count > 0);
  const totalReviews = summaries.reduce((n, r) => n + r.review_count, 0);
  const salonAvg =
    totalReviews > 0
      ? summaries.reduce((n, r) => n + r.avg_rating * r.review_count, 0) / totalReviews
      : null;

  // Naming the matched stylist only helps when the filter actually narrowed the
  // roster — if everyone matched, listing every name back is just noise.
  const namesMatched =
    filterActive && matched.length > 0 && matched.length < roster.length
      ? matched.map((p) => p.name)
      : [];

  return (
    <SurfaceCard padded={false} className="overflow-hidden">
      <div className="p-4">
        <div className="flex gap-3">
          <div className="size-[52px] rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Scissors className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold leading-tight truncate">
              {salonName}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[11px] text-muted-foreground">
                {roster.length} stylists
              </span>
              {city && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="size-3 text-primary" />
                  {city}
                </span>
              )}
            </div>
            {salonAvg !== null && (
              <div
                className="flex items-center gap-1 mt-1"
                aria-label={`Salon average ${salonAvg.toFixed(1)} out of 5 from ${totalReviews} stylist reviews`}
              >
                <StarRating value={salonAvg} size="size-3" />
                <span className="text-[10px] font-body font-semibold">
                  {salonAvg.toFixed(1)}
                </span>
                <span className="text-[10px] font-body text-muted-foreground">
                  salon average ({totalReviews})
                </span>
              </div>
            )}
          </div>
        </div>

        {namesMatched.length > 0 && (
          <p className="mt-3 rounded-[10px] border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] font-body leading-snug">
            <span className="font-semibold uppercase tracking-[0.12em] text-primary">
              Matched —{" "}
            </span>
            {namesMatched.join(", ")}
          </p>
        )}

        {shownSpecs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {shownSpecs.map((s) => (
              <span
                key={s}
                className="bg-primary/10 text-foreground text-[10px] px-2 py-1 rounded-full"
              >
                {s}
              </span>
            ))}
            {extraSpecs > 0 && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                +{extraSpecs} more
              </span>
            )}
          </div>
        )}

        {anyDiscount && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-body text-foreground/85">
            <Tag className="size-3.5 text-primary shrink-0" />
            Discounts available — see each stylist
          </p>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px]"
        >
          {open ? "Hide stylists" : `See ${roster.length} stylists`}
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background/50 p-3 space-y-3">
          {roster.map((p) => (
            <div key={p.id}>{renderStylist(p)}</div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};

export default SalonGroupCard;
