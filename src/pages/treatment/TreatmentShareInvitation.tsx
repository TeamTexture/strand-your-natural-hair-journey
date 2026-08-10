import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, ListChecks } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useShareDetail, useShareResponse } from "@/hooks/useTreatmentShares";

const fmt = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

/**
 * A member has tagged this professional into their plan. Read-only access:
 * accepting never grants any ability to change the member's plan, and media
 * stays hidden unless the member has switched sharing on.
 */
const TreatmentShareInvitation = () => {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { detail, loading } = useShareDetail(shareId);
  const respond = useShareResponse();

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Plan shared with you" backFallback="/home" />
        <LoadingDot />
      </ScreenLayout>
    );
  }

  if (!detail) {
    return (
      <ScreenLayout>
        <TitleBar title="Plan shared with you" backFallback="/home" />
        <div className="px-5 pt-4">
          <EmptyState
            icon="🌱"
            message="We couldn't find that invitation. If it was sent to a different email address, sign in with that one."
          />
        </div>
      </ScreenLayout>
    );
  }

  const weeks = Number(detail.duration_weeks ?? 0);

  const act = (accept: boolean) => {
    if (!shareId) return;
    respond.mutate(
      { shareId, accept },
      {
        onSuccess: () => {
          if (accept) {
            toast.success("Added to your clients");
            navigate("/pro/treatment", { replace: true });
          } else {
            toast("Declined — nothing else happens.");
            navigate("/home", { replace: true });
          }
        },
        onError: (e) =>
          toast.error(
            String((e as Error).message) === "undertaking_required"
              ? "Accept the professional undertaking in the pro area first"
              : "Couldn't do that just now",
          ),
      },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title="Plan shared with you" backFallback="/home" />

      <div className="px-5 pt-1 pb-10 space-y-4">
        <div>
          <p className="font-body text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
            From a STRAND member
          </p>
          <h1 className="font-display text-[24px] leading-tight mt-1 [overflow-wrap:anywhere]">
            {detail.member_name} would like you to follow their treatment plan
          </h1>
        </div>

        <SurfaceCard tone="gold" className="space-y-1">
          <p className="font-body text-[15px] font-semibold [overflow-wrap:anywhere]">
            {detail.plan_title || "Treatment plan"}
          </p>
          <p className="font-body text-[12.5px] text-muted-foreground">
            {weeks ? `${weeks} week${weeks === 1 ? "" : "s"}` : "Ongoing"} · starts {fmt(detail.start_date)}
          </p>
        </SurfaceCard>

        <SurfaceCard className="space-y-2">
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 shrink-0" />
            <p className="font-body text-[13px]">
              {detail.step_count ?? 0} step{(detail.step_count ?? 0) === 1 ? "" : "s"} in the plan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="size-4 shrink-0" />
            <p className="font-body text-[13px]">
              You'll see the plan, the steps they tick off and their weekly check-ins.
            </p>
          </div>
          <p className="font-body text-[12px] text-muted-foreground leading-snug">
            Photos, videos and voice notes stay private unless they switch sharing on, and they can
            turn that off at any time. Following a plan never lets you change it.
          </p>
        </SurfaceCard>

        {detail.status === "pending" ? (
          <div className="space-y-2">
            <Button
              className="rounded-pill w-full"
              disabled={respond.isPending}
              onClick={() => act(true)}
            >
              Accept and follow their progress
            </Button>
            <Button
              variant="outline"
              className="rounded-pill w-full"
              disabled={respond.isPending}
              onClick={() => act(false)}
            >
              Decline
            </Button>
          </div>
        ) : (
          <SurfaceCard>
            <p className="font-body text-[13px]">
              {detail.status === "accepted"
                ? "You're already following this plan."
                : detail.status === "declined"
                  ? "You declined this invitation."
                  : "This invitation is no longer active."}
            </p>
          </SurfaceCard>
        )}
      </div>
    </ScreenLayout>
  );
};

export default TreatmentShareInvitation;
