import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionHeader from "@/components/nav/SectionHeader";
import { Button } from "@/components/ui/button";
import { usePlanInvitations } from "@/hooks/useTreatmentAssignments";

/**
 * A quiet prompt on the dashboard when someone has been invited to a plan.
 * It never accepts anything — it only opens the invitation screen, where the
 * member reads the whole thing before deciding.
 */
const PendingPlanInvites = () => {
  const navigate = useNavigate();
  const { invitations, loading } = usePlanInvitations();

  if (loading || invitations.length === 0) return null;

  return (
    <div className="space-y-2">
      <SectionHeader icon={Sparkles}>Plan invitation</SectionHeader>
      {invitations.map((inv) => (
        <SurfaceCard key={inv.id} tone="gold" className="space-y-2">
          <p className="font-display text-[16px] leading-snug">
            You've been invited to follow a treatment plan.
          </p>
          <p className="font-body text-[13px] text-muted-foreground leading-snug">
            Have a read of what's involved before you decide.
          </p>
          <Button
            className="rounded-pill w-full"
            onClick={() => navigate(`/treatment/invitation/${inv.id}`)}
          >
            View the plan
          </Button>
        </SurfaceCard>
      ))}
    </div>
  );
};

export default PendingPlanInvites;
