import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useSetPlanStatus, useTreatmentPlan, useUpdatePlanReminder } from "@/hooks/useTreatmentPlans";
import PlanHowItWorks from "@/components/treatment/PlanHowItWorks";
import ThisWeekCard from "@/components/treatment/ThisWeekCard";
import PlanTimeline from "@/components/treatment/PlanTimeline";
import PlanSettings from "@/components/treatment/PlanSettings";
import TreatmentReadOnlyNotice from "@/components/treatment/TreatmentReadOnlyNotice";
import { type ReminderSettings } from "@/components/treatment/ReminderPicker";
import { useTreatmentCheckins } from "@/hooks/useTreatmentCheckin";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import {
  computeAdherence,
  fromDateKey,
  todayKey,
  weekBreakdown,
  weekNumberFor,
} from "@/lib/treatmentSchedule";

/**
 * A member's treatment plan, in four zones: what's happening now (header),
 * how to use it, this week, the whole plan, then settings. Everything the page
 * could ever do is still here — it just isn't all shouting at once.
 */
const TreatmentPlanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bundle, loading, refetch } = useTreatmentPlan(id);
  const setStatus = useSetPlanStatus();
  const updateReminder = useUpdatePlanReminder();
  const { checkins } = useTreatmentCheckins(id);
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
  const readOnly = !hasPlus || paused;

  const openCheckin = (week: number) => navigate(`/treatment/${plan.id}/checkin/${week}`);

  const currentWeek = Math.max(
    1,
    Math.min(plan.duration_weeks, weekNumberFor(plan.start_date, todayKey())),
  );
  const thisWeek = weeks.find((w) => w.week === currentWeek);
  const doneWeeks = new Set(checkins.filter((c) => c.submitted_at).map((c) => c.week_number));

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
        {/* ZONE 1 — header */}
        <div className="space-y-2.5">
          <div className="min-w-0">
            <h1 className="font-display text-[24px] leading-tight break-words">{plan.title}</h1>
            <p className="font-body text-[13px] text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
              Week {currentWeek} of {plan.duration_weeks}
              {plan.goal ? ` · ${plan.goal}` : ""}
            </p>
            {paused && (
              <p className="font-body text-[12.5px] text-muted-foreground mt-0.5">
                Paused since {format(fromDateKey(plan.start_date), "d MMM yyyy")} — pick it back up
                in plan settings.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div
              className="h-2 w-full rounded-pill bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={adherence.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Plan progress"
            >
              <div
                className="h-full rounded-pill bg-primary transition-all"
                style={{ width: `${Math.max(adherence.hasData ? 3 : 0, adherence.percent)}%` }}
              />
            </div>
            <p className="font-body text-[12px] text-muted-foreground">
              {thisWeek ? `${thisWeek.line} this week` : "Your first step will show up here."}
            </p>
          </div>

          <Button className="rounded-pill w-full" onClick={() => openCheckin(currentWeek)}>
            <ClipboardCheck className="size-4 mr-1.5" />
            {hasPlus ? `Log week ${currentWeek} check-in` : `Read week ${currentWeek} check-in`}
          </Button>

          {!hasPlus && <TreatmentReadOnlyNotice next={`/treatment/${plan.id}`} />}
        </div>

        {/* ZONE 2 — how this works */}
        <PlanHowItWorks planId={plan.id} />

        {/* ZONE 3 — this week */}
        <ThisWeekCard
          bundle={bundle}
          currentWeek={currentWeek}
          isMilestone={milestoneWeeks.includes(currentWeek)}
          disabled={readOnly}
        />

        {/* ZONE 4 — the whole plan */}
        <PlanTimeline
          planId={plan.id}
          startDate={plan.start_date}
          durationWeeks={plan.duration_weeks}
          schedule={schedule}
          weeks={weeks}
          checkedInWeeks={doneWeeks}
          goal={plan.goal}
          products={products}
          onProductsChanged={() => void refetch()}
          onCheckin={openCheckin}
          disabled={readOnly}
        />

        {/* ZONE 5 — settings */}
        <PlanSettings
          planId={plan.id}
          reminder={{
            frequency: plan.reminder_frequency ?? "weekly",
            weekday: plan.reminder_weekday ?? 0,
            hour: plan.reminder_hour ?? 9,
          }}
          onReminderChange={(next: ReminderSettings) =>
            updateReminder.mutate(
              { planId: plan.id, ...next },
              {
                onError: () => toast.error("Couldn't save that reminder just now"),
                onSuccess: () => toast.success("Reminder updated"),
              },
            )
          }
          paused={paused}
          onTogglePause={togglePause}
          hasPlus={hasPlus}
          disabled={readOnly}
        />
      </div>
    </ScreenLayout>
  );
};

export default TreatmentPlanDetail;
