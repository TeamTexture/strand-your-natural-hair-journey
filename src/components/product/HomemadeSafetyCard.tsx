// Standalone safety caution for homemade products.
//
// Deliberately NOT folded into the tone/score line: a commercial product is
// pre-formulated at safe ratios, a kitchen recipe is not, so a known DIY hazard
// has to read as its own clear caution rather than a footnote inside a summary
// that otherwise says nice things about shea butter.

import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { cn } from "@/lib/utils";
import type { HomemadeSafetyPayload } from "@/lib/homemade";

const HomemadeSafetyCard = ({ safety }: { safety: HomemadeSafetyPayload }) => {
  const hazard = safety.severity === "hazard";
  const caution = safety.severity === "caution";
  const Icon = hazard ? AlertTriangle : caution ? Info : ShieldCheck;

  return (
    <SurfaceCard
      className={cn(
        "p-4 space-y-3 border",
        hazard && "border-destructive/50 bg-destructive/[0.06]",
        caution && "border-warn/60 bg-warn/[0.08]",
        !hazard && !caution && "border-good/50 bg-good/[0.07]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "size-4 mt-0.5 shrink-0",
            hazard ? "text-destructive" : caution ? "text-warn" : "text-good",
          )}
        />
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">
            Homemade safety check
          </p>
          <p className="font-display text-[15px] leading-snug text-foreground">
            {safety.headline}
          </p>
        </div>
      </div>

      {safety.hazards.length > 0 && (
        <ul className="space-y-3">
          {safety.hazards.map((h) => (
            <li key={h.id} className="space-y-1">
              <p className="text-[13px] font-body font-semibold text-foreground leading-snug">
                {h.title}
              </p>
              <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                {h.trigger}
              </p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {h.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {safety.unverified.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground leading-relaxed border-t border-border/60 pt-2.5">
          <span className="font-semibold text-foreground">Lower confidence: </span>
          {safety.unverified.join(", ")} {safety.unverified.length === 1 ? "isn't" : "aren't"} in
          STRAND's verified ingredient glossary, so anything said about{" "}
          {safety.unverified.length === 1 ? "it" : "them"} is general reasoning rather than
          verified fact.
        </p>
      )}
    </SurfaceCard>
  );
};

export default HomemadeSafetyCard;
