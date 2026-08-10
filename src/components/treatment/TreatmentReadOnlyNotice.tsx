import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";

/**
 * Shown on an existing plan when the member's STRAND+ has lapsed. Nothing is
 * ever deleted: everything already recorded stays readable and playable, only
 * new tick-offs, check-ins and uploads stop.
 */
const TreatmentReadOnlyNotice = ({ next }: { next: string }) => (
  <SurfaceCard className="space-y-2 border-primary/40">
    <div className="flex items-start gap-2.5">
      <span className="size-7 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
        <Lock className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="font-body text-[13.5px] font-semibold">This plan is read-only for now</p>
        <p className="font-body text-[12.5px] text-muted-foreground leading-snug mt-0.5">
          Everything you've recorded is still here — every entry, check-in, photo, clip and voice
          note. Renewing STRAND+ picks the plan back up exactly where you left it.
        </p>
      </div>
    </div>
    <Link to={`/plus/upgrade?next=${encodeURIComponent(next)}`} className="block">
      <Button variant="gold" size="pill" className="w-full">
        Renew STRAND+ — £14.99/mo
      </Button>
    </Link>
  </SurfaceCard>
);

export default TreatmentReadOnlyNotice;
