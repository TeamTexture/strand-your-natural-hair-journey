import { Droplets, Users, Sparkles } from "lucide-react";
import { lookupHardWater } from "@/lib/hardWater";
import { cn } from "@/lib/utils";

interface Props {
  postcode: string | null | undefined;
  className?: string;
}

/**
 * Inline card revealed under postcode inputs.
 *
 * Top-level explanation of what the reading means for the hair, followed by
 * a nudge to speak to a professional and a teaser for the Hello Klean
 * member discount. Deliberately non-alarmist.
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

  const showRemedyCards = res.hardness === "hard" || res.hardness === "very-hard";

  const meansForHair =
    res.hardness === "soft"
      ? "Great news — soft water rinses cleanly, so your washes will feel light and product lifts off easily."
      : res.hardness === "moderate"
      ? "Manageable. A small amount of mineral can gently dull curls over time — nothing to worry about, just something to keep an eye on."
      : res.hardness === "hard"
      ? "This can gradually leave a mineral film on the strand — curls may feel a little heavier or look duller between washes. It's very common and easy to manage once you know."
      : "There's more mineral in the water where you live. Over time this can sit on the strand and make curls feel drier or look duller — it's a known factor for lots of people in your area and completely workable.";

  return (
    <div className={cn("mt-2 space-y-2", className)}>
      {/* Reading */}
      <div className={cn("rounded-[12px] border p-3 flex gap-2.5 items-start", tone)}>
        <Droplets className="size-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-foreground">{res.label}</p>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5">
              Beta — water data accuracy improving
            </span>
          </div>
          <p className="text-[12px] leading-snug text-foreground/85 font-body mt-1">
            <span className="font-semibold text-foreground">What this means for your hair — </span>
            {meansForHair}
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
            Based on {res.area}
          </p>
        </div>
      </div>

      {showRemedyCards && (
        <>
          {/* Speak to a pro */}
          <div className="rounded-[12px] border border-primary/25 bg-primary/5 p-3 flex gap-2.5 items-start">
            <Users className="size-4 shrink-0 mt-0.5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-foreground leading-snug">
                First, speak to your hair professional
              </p>
              <p className="text-[11.5px] leading-snug text-foreground/80 font-body mt-1">
                Ask them how they'd like you to work around the water hardness in your area —
                they know your hair, your routine and your history, and can guide you on what
                to remedy first.
              </p>
            </div>
          </div>

          {/* Member perk teaser */}
          <div className="rounded-[12px] border border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3 flex gap-2.5 items-start">
            <Sparkles className="size-4 shrink-0 mt-0.5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-foreground leading-snug">
                Member perk — Hello Klean shower filter
              </p>
              <p className="text-[11.5px] leading-snug text-foreground/80 font-body mt-1">
                When you become a STRAND member you'll unlock a discount with Hello Klean —
                a shower filter designed to soften your water at the tap, so every wash starts
                on a cleaner slate.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HardWaterHint;
