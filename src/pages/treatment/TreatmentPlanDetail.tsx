import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  useSetPlanStatus,
  useTreatmentPlan,
  useUpdateCheckinCadence,
  useUpdatePlanReminder,
} from "@/hooks/useTreatmentPlans";
import PlanHowItWorks from "@/components/treatment/PlanHowItWorks";
import PlanActionBlock from "@/components/treatment/PlanActionBlock";
import PlanStreakCard from "@/components/treatment/PlanStreakCard";
import PlanCheckinsSection from "@/components/treatment/PlanCheckinsSection";
import ThisWeekCard from "@/components/treatment/ThisWeekCard";
import PlanTimeline from "@/components/treatment/PlanTimeline";
import PlanSettings from "@/components/treatment/PlanSettings";
import TreatmentReadOnlyNotice from "@/components/treatment/TreatmentReadOnlyNotice";
import { type ReminderSettings } from "@/components/treatment/ReminderPicker";
import { useTreatmentCheckins } from "@/hooks/useTreatmentCheckin";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import {
  checkinCycles,
  computeAdherence,
  fromDateKey,
  todayKey,
  weekBreakdown,
  weekNumberFor,
} from "@/lib/treatmentSchedule";

/**
 * A member's treatment plan. Two rhythms live in this app and only one of them
 * belongs here: the DAILY rhythm (steps, ticks, streak) is Home's job, and this
 * page carries the CHECK-IN rhythm — reflection at the end of a cycle she chose.
 *
 * Order matters: one thing to do, then the run, then the record of this week,
 * then check-ins, then the whole plan, then settings.
 */
const TreatmentPlanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bundle, loading, refetch } = useTreatmentPlan(id);
  const setStatus = useSetPlanStatus();
  const updateReminder = useUpdatePlanReminder();
  const updateCadence = useUpdateCheckinCadence();
  const { checkins, media } = useTreatmentCheckins(id);
  // Lapsed STRAND+ keeps every read: entries, check-ins and media all stay.
  const { hasPlus } = usePlusAccess();
  const [settingsRow, setSettingsRow] = useState<string | null>(null);

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

  const everyWeeks = plan.checkin_every_weeks ?? 1;
  const cycles = checkinCycles(plan.start_date, plan.duration_weeks, everyWeeks);
  const savedWeeks = new Set(
    checkins.filter((c) => c.submitted_at).map((c) => c.week_number),
  );

  const currentWeek = Math.max(
    1,
    Math.min(plan.duration_weeks, weekNumberFor(plan.start_date, todayKey())),
  );
  const thisWeek = weeks.find((w) => w.week === currentWeek);

  const togglePause = () =>
    setStatus.mutate(
      { planId: plan.id, status: paused ? "active" : "paused" },
      {
        onSuccess: () =>
          toast.success(paused ? "Plan picked back up" : "Plan paused — it'll be here when you're ready"),
        onError: () => toast.error("Couldn't update that just now"),
      },
    );

  const openCadence = () => {
    setSettingsRow("cadence");
    requestAnimationFrame(() =>
      document.getElementById("plan-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title="Treatment plan" backFallback="/home" />

      <div className="px-5 pt-1 pb-8 space-y-4">
        {/* header */}
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

          {!hasPlus && <TreatmentReadOnlyNotice next={`/treatment/${plan.id}`} />}
        </div>

        {/* the one thing to do — or nothing at all */}
        <PlanActionBlock
          bundle={bundle}
          cycles={cycles}
          savedWeeks={savedWeeks}
          milestoneWeeks={milestoneWeeks}
          onCheckin={openCheckin}
          disabled={readOnly}
        />

        {/* how this works */}
        <PlanHowItWorks planId={plan.id} />

        {/* the run */}
        <PlanStreakCard entries={entries} />

        {/* this week's record */}
        <ThisWeekCard
          bundle={bundle}
          currentWeek={currentWeek}
          isMilestone={milestoneWeeks.includes(currentWeek)}
          disabled={readOnly}
        />

        {/* check-ins */}
        <PlanCheckinsSection
          cycles={cycles}
          checkins={checkins}
          media={media}
          schedule={schedule}
          entries={entries}
          startDate={plan.start_date}
          everyWeeks={everyWeeks}
          milestoneWeeks={milestoneWeeks}
          onCheckin={openCheckin}
          onChangeCadence={openCadence}
          disabled={readOnly}
        />

        {/* the whole plan */}
        <PlanTimeline
          planId={plan.id}
          startDate={plan.start_date}
          durationWeeks={plan.duration_weeks}
          schedule={schedule}
          weeks={weeks}
          checkedInWeeks={savedWeeks}
          goal={plan.goal}
          products={products}
          onProductsChanged={() => void refetch()}
          disabled={readOnly}
        />

        {/* settings */}
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
          checkinEveryWeeks={everyWeeks}
          onCadenceChange={(weeksPer) =>
            updateCadence.mutate(
              { planId: plan.id, everyWeeks: weeksPer },
              {
                onSuccess: () => toast.success("Check-in rhythm updated"),
                onError: () => toast.error("Couldn't save that just now"),
              },
            )
          }
          expanded={settingsRow}
          onExpandedChange={setSettingsRow}
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
