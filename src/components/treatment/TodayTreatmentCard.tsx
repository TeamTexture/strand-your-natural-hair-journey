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


  const onDone = (planId: string, scheduleId: string, slot: "morning" | "evening") =>
    log.mutate(
      { planId, scheduleId, slot, status: "completed" },
      { onError: () => toast.error("Couldn't save that just now — try again") },
    );

  const onSkip = (planId: string, scheduleId: string, slot: "morning" | "evening") =>
    log.mutate(
      { planId, scheduleId, slot, status: "skipped" },
      { onError: () => toast.error("Couldn't save that just now — try again") },
    );

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
      ) : (
        <div className="space-y-2.5">
          {steps.map((s) => {
            const done = s.entry?.status === "completed";
            const skipped = s.entry?.status === "skipped";
            const logged = done || skipped;

            if (logged) {
              return (
                <SurfaceCard key={s.key} tone={done ? "green" : "card"} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 size-6 rounded-full flex items-center justify-center shrink-0 ${
                      done ? "bg-good/20 text-good" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {slotLabel(s.slot)}
                    </p>
                    <p className="font-display text-[16px] leading-snug break-words">{s.row.task_name}</p>
                    <p className="font-body text-[13px] text-muted-foreground mt-0.5">
                      {done ? "Marked as done" : "Skipped — picked back up next time"}
                    </p>
                    <StepProductMarkers product={s.product} updateDue={!done} className="mt-2" />
                  </div>
                  {hasPlus && (
                    <button
                      onClick={() =>
                        s.entry &&
                        undo.mutate(
                          { entryId: s.entry.id },
                          { onError: () => toast.error("Couldn't undo that just now") },
                        )
                      }
                      className="font-body text-[12px] text-primary shrink-0 min-h-[44px] px-1"
                    >
                      Undo
                    </button>
                  )}
                </SurfaceCard>
              );
            }

            return (
              <SurfaceCard key={s.key} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
                    {slotLabel(s.slot)}
                  </p>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body font-semibold text-primary whitespace-nowrap">
                    Week {s.week} of {s.plan.duration_weeks}
                  </span>
                </div>

                <div className="min-w-0">
                  <h3 className="font-display text-[18px] leading-tight break-words">{s.row.task_name}</h3>
                  {s.row.instructions && (
                    <p className="font-body text-[13px] text-muted-foreground leading-snug mt-1 [overflow-wrap:anywhere]">
                      {s.row.instructions}
                    </p>
                  )}
                </div>

                <StepProductMarkers product={s.product} updateDue />

                {hasPlus && (
                  <>
                    <Button
                      className="w-full rounded-pill"
                      onClick={() => onDone(s.plan.id, s.row.id, s.slot)}
                    >
                      Mark as done
                    </Button>
                    <button
                      onClick={() => onSkip(s.plan.id, s.row.id, s.slot)}
                      className="w-full font-body text-[13px] text-muted-foreground min-h-[40px]"
                    >
                      {skipLabel(s.slot)}
                    </button>
                  </>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}

      {streakLine && (
        <p className="font-body text-[12px] text-muted-foreground px-1">{streakLine}</p>
      )}
    </div>
  );
};

export default TodayTreatmentCard;
