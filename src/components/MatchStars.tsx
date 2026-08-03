// The ONLY star renderer in the consumer app. Products and tools both feed it
// the personalised match score (0–100); it maps that through the single shared
// function in src/lib/matchStars.ts, so a thumbnail and its detail page can
// never disagree. Items with no score render nothing at all — no empty grey
// stars — which is the app's signal that analysis hasn't run yet.
import { cn } from "@/lib/utils";
import { formatStars, starsForItem, type MatchScored } from "@/lib/matchStars";

const SIZES = {
  sm: { star: "text-[13px]", value: "text-[11px]" },
  md: { star: "text-[17px]", value: "text-[12px]" },
  lg: { star: "text-2xl", value: "text-[13px]" },
} as const;

export default function MatchStars({
  item,
  score,
  size = "sm",
  showValue = true,
  className,
}: {
  item?: MatchScored | null;
  score?: number | null;
  size?: keyof typeof SIZES;
  showValue?: boolean;
  className?: string;
}) {
  const stars =
    item !== undefined ? starsForItem(item) : starsForItem({ match_score: score ?? null });
  if (stars == null) return null;

  const s = SIZES[size];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 shrink-0", className)}
      aria-label={`STRAND rating ${formatStars(stars)} out of 5`}
    >
      <span className={cn("relative inline-block leading-none tracking-[0.06em]", s.star)}>
        <span aria-hidden className="text-border">
          ★★★★★
        </span>
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-primary"
          style={{ width: `${(stars / 5) * 100}%` }}
        >
          ★★★★★
        </span>
      </span>
      {showValue && (
        <span className={cn("font-semibold text-primary leading-none", s.value)}>
          {formatStars(stars)}
        </span>
      )}
    </span>
  );
}
