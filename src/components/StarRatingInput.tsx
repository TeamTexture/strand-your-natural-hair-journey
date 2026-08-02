import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Large-target 1–5 star input. Sized for thumbs on a 375px screen:
 * each star is a 56px tap target, well above the 44px minimum.
 */
interface Props {
  value: number;
  onChange: (next: number) => void;
  /** Optional word under the stars ("Loved it", "Not for me"…). */
  showLabel?: boolean;
}

const LABELS: Record<number, string> = {
  1: "Not for me",
  2: "It was okay",
  3: "Good",
  4: "Really good",
  5: "Loved it",
};

const StarRatingInput = ({ value, onChange, showLabel = true }: Props) => (
  <div className="space-y-2">
    <div className="flex items-center justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={active}
            className="size-14 flex items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Star
              className={cn(
                "size-9 transition-colors",
                active ? "text-primary fill-primary" : "text-muted-foreground/40",
              )}
            />
          </button>
        );
      })}
    </div>
    {showLabel && (
      <p className="text-center text-[12px] font-body text-muted-foreground min-h-[18px]">
        {value ? LABELS[value] : "Tap to rate"}
      </p>
    )}
  </div>
);

export default StarRatingInput;
