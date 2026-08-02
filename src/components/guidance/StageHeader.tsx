import { Droplets, Layers, Sparkles, ThermometerSun, Wind, type LucideIcon } from "lucide-react";
import type { GuidanceStage } from "@/lib/tipsRender";
import { cn } from "@/lib/utils";

const STAGE_ICONS: Record<GuidanceStage, LucideIcon> = {
  prep: Layers,
  cleanse: Droplets,
  condition: ThermometerSun,
  seal: Wind,
  style: Sparkles,
};

/**
 * StageHeader — a small graphic divider that marks where in the wash day the
 * guidance below belongs. Breaks a long guidance list into the sequence the
 * user actually follows.
 */
const StageHeader = ({
  stage,
  label,
  step,
  className,
}: {
  stage: GuidanceStage;
  label: string;
  /** Optional 1-based position, rendered as "Step n". */
  step?: number;
  className?: string;
}) => {
  const Icon = STAGE_ICONS[stage];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/12">
        <Icon className="size-3.5 text-primary" aria-hidden />
      </span>
      <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
        {label}
      </p>
      <span aria-hidden className="h-px flex-1 bg-primary/20" />
      {step !== undefined && (
        <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
          Step {step}
        </span>
      )}
    </div>
  );
};

export default StageHeader;
