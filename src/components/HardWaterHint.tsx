import { Droplets } from "lucide-react";
import { lookupHardWater } from "@/lib/hardWater";
import { cn } from "@/lib/utils";

interface Props {
  postcode: string | null | undefined;
  className?: string;
}

/**
 * Small inline card that reveals the water hardness reading for a given
 * UK postcode. Used under postcode inputs in onboarding and profile review.
 */
const HardWaterHint = ({ postcode, className }: Props) => {
  const res = lookupHardWater(postcode);
  if (!res) return null;

  const tone =
    res.hardness === "soft"
      ? "border-good/40 bg-good/10 text-good"
      : res.hardness === "moderate"
      ? "border-primary/40 bg-primary/5 text-primary"
      : res.hardness === "hard"
      ? "border-warn/50 bg-warn/10 text-warn"
      : "border-alert-dark/50 bg-alert-dark/10 text-alert-dark";

  return (
    <div
      className={cn(
        "mt-2 rounded-[12px] border p-3 flex gap-2.5 items-start",
        tone,
        className,
      )}
    >
      <Droplets className="size-4 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-foreground">
            {res.label}
          </p>
          <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5">
            Beta — water data accuracy improving
          </span>
        </div>
        <p className="text-[12px] leading-snug text-foreground/80 font-body mt-1">
          {res.explanation}
        </p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
          Based on {res.area}
        </p>
      </div>
    </div>
  );
};

export default HardWaterHint;
