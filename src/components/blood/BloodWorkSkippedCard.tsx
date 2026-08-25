import { Lock } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The greyed, de-emphasised state after a member chooses to leave blood work
 * for now. It keeps the same slot rather than disappearing, and the way back in
 * stays a live, obvious button — skipping is never a dead end.
 */
const BloodWorkSkippedCard = ({
  onAdd,
  className,
}: {
  onAdd: () => void;
  className?: string;
}) => (
  <SurfaceCard className={cn("bg-muted/40 border-border/60", className)}>
    <div className="flex items-start gap-3">
      <Lock className="size-4 mt-1 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-display text-base font-semibold text-muted-foreground">
          Blood work skipped
        </p>
        <p className="text-xs text-muted-foreground font-body mt-1 leading-snug">
          The diet and nutrition section stays closed until you add results. Nothing else
          in STRAND is affected.
        </p>
      </div>
    </div>
    <Button
      variant="outline"
      size="pill"
      className="w-full mt-3 whitespace-normal break-words leading-tight"
      onClick={onAdd}
    >
      Add blood results →
    </Button>
  </SurfaceCard>
);

export default BloodWorkSkippedCard;
