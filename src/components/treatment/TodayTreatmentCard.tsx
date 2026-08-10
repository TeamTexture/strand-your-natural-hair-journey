import { useNavigate } from "react-router-dom";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import SectionHeader from "@/components/nav/SectionHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useDueToday, useLogTreatmentStep } from "@/hooks/useTreatmentPlans";
import TreatmentStreak from "@/components/treatment/TreatmentStreak";
import StepProductMarkers from "@/components/treatment/StepProductMarkers";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import TreatmentPlusUpsell from "@/components/treatment/TreatmentPlusUpsell";
import TreatmentReadOnlyNotice from "@/components/treatment/TreatmentReadOnlyNotice";
import { skipLabel, slotLabel } from "@/lib/treatmentSchedule";

/**
 * TODAY CARD — the entire daily interaction for a treatment plan.
 *
 * One tap logs a step. No confirmation dialogs, no sheets, no second screen:
 * extra friction here is what kills adherence. Skipping is neutral by design —
 * no red, no warnings, no guilt copy anywhere on this surface.
 */
const TodayTreatmentCard = () => {
  const navigate = useNavigate();
  const { steps, streakLine, streak, days, loading, hasActivePlan } = useDueToday();
  const { hasPlus, isLoading: plusLoading } = usePlusAccess();
  const { log, undo } = useLogTreatmentStep();

  if (loading || plusLoading) return null;

  // Treatment plans are STRAND+ for every client, no exceptions. A Basic member
  // with no plan gets the offer; one with a plan keeps read access to it.
  if (!hasPlus && !hasActivePlan) return <TreatmentPlusUpsell />;

  if (!hasActivePlan) {
    return (
      <div className="space-y-2">
        <SectionHeader icon={Sparkles}>Treatment plan</SectionHeader>
        <EmptyState
          icon="🌱"
          message="Following a treatment right now?"
          hint="Set it up once and tick it off each day — you'll see exactly how consistent you've been."
          action={
            <Button className="rounded-pill" onClick={() => navigate("/treatment/new")}>
              Create a plan
            </Button>
          }
        />
      </div>
    );
  }


  const onSkip = (planId: string, scheduleId: string, slot: "morning" | "evening") =>
    log.mutate(
      { planId, scheduleId, slot, status: "skipped" },
      { onError: () => toast.error("Couldn't save that just now — try again") },
    );

  // Logged steps drop off the card straight away and the next one takes its
  // place — she only ever sees what's still outstanding.
  const pending = steps.filter((s) => !s.entry);
  const loggedToday = steps.filter((s) => s.entry);
  const current = pending[0];
  const lastLogged = loggedToday[loggedToday.length - 1];

  return (
    <div className="space-y-2" data-tour="treatment-today">
      <SectionHeader
        icon={Sparkles}
        action={
          <button
            onClick={() => navigate(`/treatment/${steps[0]?.plan.id ?? ""}`)}
            className="font-body text-[12px] text-primary"
          >
            View plan
          </button>
        }
      >
        My treatment plan
      </SectionHeader>

      <TreatmentStreak streak={streak} days={days} />

      {!hasPlus && <TreatmentReadOnlyNotice next="/home" />}

      {steps.length === 0 ? (
        <SurfaceCard>
          <p className="font-display text-[16px] leading-snug">Nothing due today.</p>
          <p className="font-body text-[13px] text-muted-foreground mt-1">
            Your next step comes round on schedule.
          </p>
        </SurfaceCard>
      ) : !current ? (
        <SurfaceCard tone="green" className="flex items-start gap-3">
          <span className="mt-0.5 size-6 rounded-full flex items-center justify-center shrink-0 bg-good/20 text-good">
            <Check className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] leading-snug">That's today logged.</p>
            <p className="font-body text-[13px] text-muted-foreground mt-0.5">
              {loggedToday.length === 1
                ? "One step logged."
                : `${loggedToday.length} steps logged.`}{" "}
              Your next step comes round on schedule.
            </p>
          </div>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
              {slotLabel(current.slot)}
            </p>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body font-semibold text-primary whitespace-nowrap">
              Week {current.week} of {current.plan.duration_weeks}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="font-display text-[18px] leading-tight break-words">
              {current.row.task_name}
            </h3>
            {current.row.instructions && (
              <p className="font-body text-[13px] text-muted-foreground leading-snug mt-1 [overflow-wrap:anywhere]">
                {current.row.instructions}
              </p>
            )}
          </div>

          <StepProductMarkers product={current.product} updateDue />

          {pending.length > 1 && (
            <p className="font-body text-[12px] text-muted-foreground">
              {pending.length - 1} more due today after this one.
            </p>
          )}

          {hasPlus && (
            <>
              <Button className="w-full rounded-pill" onClick={() => setLogging(true)}>
                Log this step
              </Button>
              <button
                onClick={() => onSkip(current.plan.id, current.row.id, current.slot)}
                className="w-full font-body text-[13px] text-muted-foreground min-h-[40px]"
              >
                {skipLabel(current.slot)}
              </button>
            </>
          )}
        </SurfaceCard>
      )}

      {hasPlus && lastLogged?.entry && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="font-body text-[12px] text-muted-foreground min-w-0 truncate">
            {lastLogged.entry.status === "completed" ? "Logged" : "Skipped"}:{" "}
            {lastLogged.row.task_name}
          </p>
          <button
            onClick={() =>
              undo.mutate(
                { entryId: lastLogged.entry!.id },
                { onError: () => toast.error("Couldn't undo that just now") },
              )
            }
            className="font-body text-[12px] text-primary shrink-0 min-h-[36px] px-1 inline-flex items-center gap-1"
          >
            <RotateCcw className="size-3" />
            Undo
          </button>
        </div>
      )}

      {current && (
        <StepLogSheet
          open={logging}
          onOpenChange={setLogging}
          taskName={current.row.task_name}
          slot={current.slot}
          instructions={current.row.instructions}
          saving={log.isPending}
          onSave={(note) =>
            log.mutate(
              {
                planId: current.plan.id,
                scheduleId: current.row.id,
                slot: current.slot,
                status: "completed",
                note,
              },
              {
                onSuccess: () => {
                  setLogging(false);
                  toast.success("Logged");
                },
                onError: () => toast.error("Couldn't save that just now — try again"),
              },
            )
          }
        />
      )}


      {streakLine && (
        <p className="font-body text-[12px] text-muted-foreground px-1">{streakLine}</p>
      )}
    </div>
  );
};

export default TodayTreatmentCard;
