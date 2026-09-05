// LAYER 2 — "YOUR WEEK". One card, one AI call per week.
//
// Renders nothing at all until there is a real pattern to describe (two or more
// entries in the window) and a complete card to show. No skeleton, no empty
// state, no "not enough data yet" — an absent card is silent.

import Eyebrow from "@/components/nav/Eyebrow";
import SurfaceCard from "@/components/SurfaceCard";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";
import { useDailyPatternTip } from "@/hooks/useDailyPatternTip";

const WeeklyPatternCard = () => {
  const { tip, summary } = useDailyPatternTip();
  if (!tip || !summary) return null;

  return (
    <SurfaceCard tone="gold" className="space-y-2">
      <Eyebrow>Your week</Eyebrow>
      <p className="font-display text-[15px] leading-snug break-words [overflow-wrap:anywhere]">
        {tip.headline}
      </p>
      <div className="font-body text-[12.5px] leading-relaxed text-foreground/90">
        <GlossaryRichText text={tip.pattern ?? ""} />
      </div>
      <div className="rounded-[10px] bg-secondary p-3">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
          Next week
        </p>
        <div className="mt-1.5 font-body text-[12.5px] leading-relaxed text-foreground/90">
          <GlossaryRichText text={tip.next_step ?? ""} />
        </div>
      </div>
      <p className="font-body text-[11px] text-muted-foreground">
        {summary.daysLogged} {summary.daysLogged === 1 ? "day" : "days"} logged
        {summary.applicationsSinceWash > 0
          ? `, ${summary.applicationsSinceWash} product ${
              summary.applicationsSinceWash === 1 ? "application" : "applications"
            } since your last wash`
          : ""}
      </p>
    </SurfaceCard>
  );
};

export default WeeklyPatternCard;
