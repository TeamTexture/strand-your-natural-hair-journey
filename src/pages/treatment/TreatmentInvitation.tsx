import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, Clock, Package, Sparkles } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import MediaConsentToggle from "@/components/treatment/MediaConsentToggle";
import WhatTheyCanSee from "@/components/treatment/WhatTheyCanSee";
import {
  useInvitationActions,
  useInvitationDetail,
  type InvitationStep,
} from "@/hooks/useTreatmentAssignments";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import { cadenceSummary, type ScheduleRow } from "@/lib/treatmentSchedule";

const stepLine = (s: InvitationStep) =>
  cadenceSummary({
    id: s.id,
    plan_id: "",
    task_name: s.task_name,
    cadence: s.cadence,
    days_of_week: s.days_of_week ?? [],
    time_of_day: s.time_of_day,
    step_order: s.step_order,
  } as unknown as ScheduleRow);

/**
 * CLIENT INVITATION AND CONSENT.
 *
 * The whole plan is readable before any decision is made, and the two
 * decisions — following the plan, and sharing media — are never bundled.
 */
const TreatmentInvitation = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { invitation, loading } = useInvitationDetail(assignmentId);
  const { accept, decline, setMediaConsent } = useInvitationActions();
  const [shareMedia, setShareMedia] = useState(false);
  // Reading the proposal is never gated. Accepting it is — treatment plans are
  // STRAND+ for every client, including plans sent by a professional or STRAND.
  const { hasPlus } = usePlusAccess();

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Plan invitation" backFallback="/home" />
        <LoadingDot />
      </ScreenLayout>
    );
  }

  if (!invitation || !invitation.template) {
    return (
      <ScreenLayout>
        <TitleBar title="Plan invitation" backFallback="/home" />
        <div className="px-5 pt-4">
          <EmptyState icon="🌱" message="We couldn't find that invitation." />
        </div>
      </ScreenLayout>
    );
  }

  const name = invitation.sender_name;
  const t = invitation.template;
  const milestones = t.milestone_weeks ?? [];

  const onAccept = () => {
    if (!assignmentId) return;
    accept.mutate(assignmentId, {
      onSuccess: async (planId) => {
        // Media sharing is a separate write, and only if it was switched on.
        if (shareMedia) {
          try {
            await setMediaConsent.mutateAsync({ assignmentId, on: true });
          } catch {
            toast("Plan added. We couldn't save the sharing switch — you can set it on the plan.");
          }
        }
        toast.success("Plan added");
        navigate(`/treatment/${planId}`, { replace: true });
      },
      onError: () => toast.error("Couldn't accept that just now"),
    });
  };

  const onDecline = () => {
    if (!assignmentId) return;
    decline.mutate(assignmentId, {
      onSuccess: () => {
        toast("Declined — nothing else happens.");
        navigate("/home", { replace: true });
      },
      onError: () => toast.error("Couldn't do that just now"),
    });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Plan invitation" backFallback="/home" />

      <div className="px-5 pt-1 pb-10 space-y-4">
        <div>
          <p className="font-body text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
            {invitation.assigner_type === "admin" ? "From STRAND" : "From your professional"}
          </p>
          <h1 className="font-display text-[24px] leading-tight mt-1 [overflow-wrap:anywhere]">
            {name}
            {invitation.sender_title ? ` · ${invitation.sender_title}` : ""} has put together a plan
            for you
          </h1>
        </div>

        <SurfaceCard tone="gold" className="space-y-1">
          <p className="font-display text-[18px] leading-snug [overflow-wrap:anywhere]">{t.title}</p>
          {t.description && (
            <p className="font-body text-[13px] leading-snug [overflow-wrap:anywhere]">
              {t.description}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 font-body text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" /> {t.duration_weeks} weeks
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {invitation.steps.length} steps
            </span>
            <span className="inline-flex items-center gap-1">
              <Package className="size-3.5" /> {invitation.product_count} products
            </span>
          </div>
        </SurfaceCard>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">What you'd be doing</SectionLabel>
          <div className="space-y-1.5">
            {invitation.steps.map((s) => (
              <SurfaceCard key={s.id} className="space-y-0.5">
                <p className="font-body text-[14px] font-semibold [overflow-wrap:anywhere]">
                  {s.task_name}
                </p>
                <p className="font-body text-[12px] text-muted-foreground">{stepLine(s)}</p>
                {s.instructions && (
                  <p className="font-body text-[13px] text-muted-foreground leading-snug pt-1 [overflow-wrap:anywhere]">
                    {s.instructions}
                  </p>
                )}
              </SurfaceCard>
            ))}
            {invitation.steps.length === 0 && (
              <SurfaceCard>
                <p className="font-body text-[13px] text-muted-foreground">
                  No steps have been added to this plan yet.
                </p>
              </SurfaceCard>
            )}
          </div>
          {milestones.length > 0 && (
            <p className="font-body text-[12px] text-muted-foreground">
              Photo weeks: {milestones.join(", ")}.
            </p>
          )}
        </div>

        <WhatTheyCanSee name={name} />

        <div className="space-y-2 pt-1">
          {hasPlus ? (
            <>
              <Button className="rounded-pill w-full" onClick={onAccept} disabled={accept.isPending}>
                Accept this plan
              </Button>
              <MediaConsentToggle name={name} value={shareMedia} onChange={setShareMedia} />
            </>
          ) : (
            <SurfaceCard tone="gold" className="space-y-2">
              <div className="flex items-start gap-2.5">
                <span className="size-7 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="font-body text-[13.5px] font-semibold">
                    Following a plan is a STRAND+ feature
                  </p>
                  <p className="font-body text-[12.5px] text-muted-foreground leading-snug mt-0.5">
                    Reading it is free — you've just done that. To follow it day by day, tick steps
                    off and save your weekly check-ins, you'll need STRAND+ at £14.99 a month.
                  </p>
                </div>
              </div>
              <Link
                to={`/plus/upgrade?next=${encodeURIComponent(`/treatment/invitation/${assignmentId ?? ""}`)}`}
                className="block"
              >
                <Button variant="gold" size="pill" className="w-full">
                  Upgrade to accept
                </Button>
              </Link>
            </SurfaceCard>
          )}
          <button
            type="button"
            onClick={onDecline}
            disabled={decline.isPending}
            className="w-full font-body text-[13px] text-muted-foreground py-2"
          >
            Decline
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default TreatmentInvitation;
