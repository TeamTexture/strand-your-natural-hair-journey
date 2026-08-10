import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Camera, Check, ClipboardCheck, Pause, Pencil, Play, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSetPlanStatus, useTreatmentPlan, useUpdatePlanReminder } from "@/hooks/useTreatmentPlans";
import { useInvitationActions, usePlanAssignment } from "@/hooks/useTreatmentAssignments";
import MediaConsentToggle from "@/components/treatment/MediaConsentToggle";
import PlanSharesSection from "@/components/treatment/PlanSharesSection";
import CatchUpDays from "@/components/treatment/CatchUpDays";
import PlanAppointmentsSection from "@/components/treatment/PlanAppointmentsSection";
import PlanTimeline from "@/components/treatment/PlanTimeline";
import PlanOverviewCard from "@/components/treatment/PlanOverviewCard";
import PlanProductsSection from "@/components/treatment/PlanProductsSection";



import WhatTheyCanSee from "@/components/treatment/WhatTheyCanSee";
import BrandTagList from "@/components/brand/BrandTagList";
import BrandTagControl from "@/components/brand/BrandTagControl";
import { useTreatmentCheckins } from "@/hooks/useTreatmentCheckin";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import TreatmentReadOnlyNotice from "@/components/treatment/TreatmentReadOnlyNotice";
import ReminderPicker, { type ReminderSettings } from "@/components/treatment/ReminderPicker";
import {
  computeAdherence,
  fromDateKey,
  todayKey,
  weekBreakdown,
  weekNumberFor,
} from "@/lib/treatmentSchedule";

/** Adherence ring — percentage inside, raw count beneath. Never red. */
const AdherenceRing = ({ percent }: { percent: number }) => {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 96 96" className="size-[104px] shrink-0" aria-hidden>
      <circle cx="48" cy="48" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * c} ${c}`}
        transform="rotate(-90 48 48)"
      />
      <text
        x="48"
        y="53"
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 22, fontFamily: "Playfair Display, serif" }}
      >
        {percent}%
      </text>
    </svg>
  );
};

const TreatmentPlanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bundle, loading, refetch } = useTreatmentPlan(id);
  const setStatus = useSetPlanStatus();
  const updateReminder = useUpdatePlanReminder();
  const { checkins } = useTreatmentCheckins(id);
  const { assignment } = usePlanAssignment(id);
  const { setMediaConsent } = useInvitationActions();
  // Lapsed STRAND+ keeps every read: entries, check-ins and media all stay.
  const { hasPlus } = usePlusAccess();


  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Treatment plan" backFallback="/home" />
        <LoadingDot />
      </ScreenLayout>
    );
  }

  if (!bundle) {
    return (
      <ScreenLayout>
        <TitleBar title="Treatment plan" backFallback="/home" />
        <div className="px-5 pt-4">
          <EmptyState
            icon="🌱"
            message="We couldn't find that plan."
            action={
              <Button className="rounded-pill" onClick={() => navigate("/treatment/new")}>
                Create a plan
              </Button>
            }
          />
        </div>
      </ScreenLayout>
    );
  }

  const { plan, schedule, entries, products, milestones } = bundle;
  const milestoneWeeks = milestones.map((m) => m.week_number);
  const adherence = computeAdherence(schedule, entries, plan.start_date);
  const weeks = weekBreakdown(schedule, entries, plan.start_date, plan.duration_weeks, milestoneWeeks);
  const paused = plan.status === "paused";

  const sharedWith = assignment?.assigner_type === "admin" ? "STRAND" : "your professional";

  const seeProgress = () => navigate(`/treatment/${plan.id}/progress`);

  const openCheckin = (week: number) => navigate(`/treatment/${plan.id}/checkin/${week}`);

  const currentWeek = Math.max(
    1,
    Math.min(plan.duration_weeks, weekNumberFor(plan.start_date, todayKey())),
  );
  const doneWeeks = new Set(
    checkins.filter((c) => c.submitted_at).map((c) => c.week_number),
  );


  const scrollToTimeline = () =>
    document.getElementById("plan-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const togglePause = () =>
    setStatus.mutate(
      { planId: plan.id, status: paused ? "active" : "paused" },
      {
        onSuccess: () =>
          toast.success(paused ? "Plan picked back up" : "Plan paused — it'll be here when you're ready"),
        onError: () => toast.error("Couldn't update that just now"),
      },
    );

  return (
    <ScreenLayout>
      <TitleBar title="Treatment plan" backFallback="/home" />

      <div className="px-5 pt-1 pb-8 space-y-4">
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[24px] leading-tight break-words">{plan.title}</h1>
            <p className="font-body text-[13px] text-muted-foreground mt-0.5">
              {plan.duration_weeks} weeks from {format(fromDateKey(plan.start_date), "d MMM yyyy")}
              {paused ? " · Paused" : ""}
            </p>
          </div>
          <button
            onClick={scrollToTimeline}
            aria-label="Edit plan"
            className="size-9 rounded-full bg-card border border-border flex items-center justify-center shrink-0 text-foreground/80"
          >
            <Pencil className="size-4" />
          </button>
        </div>

        {/* goal, challenges and the shape of the treatment, in one card */}
        <PlanOverviewCard goal={plan.goal} schedule={schedule} startDate={plan.start_date} />

        {/* the plan laid out in advance, and where it gets changed */}
        <div id="plan-timeline" className="scroll-mt-4">
          <PlanTimeline
            planId={plan.id}
            startDate={plan.start_date}
            durationWeeks={plan.duration_weeks}
            schedule={schedule}
            disabled={!hasPlus || paused}
          />
        </div>


        {/* adherence */}
        <SurfaceCard className="flex items-center gap-4">
          <AdherenceRing percent={adherence.percent} />
          <div className="min-w-0">
            <p className="font-display text-[16px] leading-snug">
              {adherence.hasData ? `${adherence.completed} of ${adherence.expected} ${adherence.unit}` : "Just getting going"}
            </p>
            <p className="font-body text-[13px] text-muted-foreground mt-1 leading-snug">
              {adherence.hasData
                ? "Counted up to today only — nothing ahead of you counts against you."
                : "Your first step will show up here."}
            </p>
            {adherence.skipped > 0 && (
              <p className="font-body text-[12px] text-muted-foreground mt-1">
                {adherence.skipped} skipped, which is completely fine.
              </p>
            )}
          </div>
        </SurfaceCard>

        {!hasPlus && <TreatmentReadOnlyNotice next={`/treatment/${plan.id}`} />}

        <ReminderPicker
          value={{
            frequency: plan.reminder_frequency ?? "weekly",
            weekday: plan.reminder_weekday ?? 0,
            hour: plan.reminder_hour ?? 9,
          }}
          onChange={(next: ReminderSettings) => {
            updateReminder.mutate(
              { planId: plan.id, ...next },
              {
                onError: () => toast.error("Couldn't save that reminder just now"),
                onSuccess: () => toast.success("Reminder updated"),
              },
            );
          }}
        />

        {/* actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button className="rounded-pill col-span-2" onClick={() => openCheckin(currentWeek)}>
            <ClipboardCheck className="size-4 mr-1.5" />
            {hasPlus ? `Week ${currentWeek} check-in` : `Read week ${currentWeek} check-in`}
          </Button>
          <Button
            variant="outline"
            className={cn("rounded-pill", !hasPlus && "col-span-2")}
            onClick={seeProgress}
          >
            <TrendingUp className="size-4 mr-1.5" /> See progress
          </Button>
          {hasPlus && (
            <>
              <Button variant="outline" className="rounded-pill" onClick={togglePause}>
                {paused ? <Play className="size-4 mr-1.5" /> : <Pause className="size-4 mr-1.5" />}
                {paused ? "Resume plan" : "Pause plan"}
              </Button>
              <Button
                variant="outline"
                className="rounded-pill col-span-2"
                onClick={() =>
                  document
                    .getElementById("plan-timeline")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Edit the plan week by week
              </Button>
            </>
          )}
        </div>


        {/* who can see what — only when someone else is attached to this plan */}
        {assignment && assignment.status === "accepted" && (
          <div className="space-y-2">
            <SectionLabel className="px-0 mt-0 mb-1.5">Sharing</SectionLabel>
            <MediaConsentToggle
              name={sharedWith}
              value={assignment.media_sharing_consent}
              disabled={setMediaConsent.isPending}
              onChange={(on) =>
                setMediaConsent.mutate(
                  { assignmentId: assignment.id, on },
                  {
                    onSuccess: () =>
                      toast.success(
                        on
                          ? "Sharing on — they can see your photos, videos and voice notes"
                          : "Sharing off — everything you've recorded stays with you",
                      ),
                    onError: () => toast.error("Couldn't change that just now"),
                  },
                )
              }
            />
            <WhatTheyCanSee name={sharedWith} />
          </div>
        )}

        {/* member-initiated sharing — tag a professional into your own plan */}
        {id && <PlanSharesSection planId={id} />}

        {/* appointments attached to this plan */}
        {id && <PlanAppointmentsSection planId={id} disabled={!hasPlus} />}


        {/* retrospective logging — a missed day can still be recorded */}
        {plan.status === "active" && <CatchUpDays bundle={bundle} disabled={!hasPlus} />}



        {/* weeks */}
        <div className="space-y-2" id="treatment-weeks">
          <SectionLabel className="px-0 mt-0 mb-1.5">Week by week</SectionLabel>
          <div className="space-y-1.5">
            {weeks.map((w) => {
              const checkedIn = doneWeeks.has(w.week);
              const openable = w.state !== "future";
              return (
                <SurfaceCard
                  key={w.week}
                  padded={false}
                  className={cn(
                    "px-4 py-3 flex items-center gap-3",
                    w.state === "current" && "border-primary/50 bg-primary/5",
                    w.state === "future" && "opacity-55",
                  )}
                  onClick={openable ? () => openCheckin(w.week) : undefined}
                  role={openable ? "button" : undefined}
                  tabIndex={openable ? 0 : undefined}
                >
                  <span
                    className={cn(
                      "size-6 rounded-full flex items-center justify-center shrink-0",
                      w.state === "past" ? "bg-good/15 text-good" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {w.state === "past" ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="font-body text-[11px]">{w.week}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold">
                      Week {w.week}
                      {w.state === "current" && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-primary">
                          This week
                        </span>
                      )}
                    </p>
                    <p className="font-body text-[12px] text-muted-foreground">
                      {w.line}
                      {checkedIn && w.state !== "future" ? " · Check-in saved" : ""}
                    </p>

                  </div>
                  {w.isMilestone && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body font-semibold text-primary">
                      <Camera className="size-3" /> Photo
                    </span>
                  )}
                </SurfaceCard>
              );
            })}
          </div>
        </div>


        {/* products */}
        {id && (
          <PlanProductsSection
            planId={id}
            products={products}
            canEdit={hasPlus && !paused}
            onChanged={() => void refetch()}
          />
        )}

        {/* brands credited on this plan */}
        <BrandTagControl taggableType="treatment_plan" taggableId={id} title="Brands" />
      </div>
    </ScreenLayout>
  );
};

export default TreatmentPlanDetail;
