import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarPlus, ChevronDown, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import StepEditorSheet from "@/components/treatment/StepEditorSheet";
import {
  appliesInWeek,
  cadenceSummary,
  fromDateKey,
  todayKey,
  weekNumberFor,
  weekRange,
  type ScheduleRow,
} from "@/lib/treatmentSchedule";
import { usePlanScheduleEditor, type StepInput } from "@/hooks/useTreatmentPlans";

type PlanAppointment = {
  id: string;
  professional_name: string;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  status: string;
};

interface Props {
  planId: string;
  startDate: string;
  durationWeeks: number;
  schedule: ScheduleRow[];
  /** Read-only when the plan is paused or she isn't on STRAND+. */
  disabled?: boolean;
}

/**
 * The whole plan, week by week — every step that applies in that week and every
 * appointment sitting in it. This is where she lays the plan out in advance and
 * where she comes back to change a step or move a visit.
 */
const PlanTimeline = ({ planId, startDate, durationWeeks, schedule, disabled }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addStep, updateStep, removeStep } = usePlanScheduleEditor(planId);

  const currentWeek = Math.max(1, Math.min(durationWeeks, weekNumberFor(startDate, todayKey())));
  const [openWeek, setOpenWeek] = useState<number | null>(currentWeek);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [addingWeek, setAddingWeek] = useState<number | null>(null);

  const { data: appointments = [] } = useQuery({
    queryKey: ["plan-appointments", planId, user?.id],
    enabled: !!user && !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, professional_name, appointment_date, appointment_time, reason, status")
        .eq("user_id", user!.id)
        .eq("treatment_plan_id", planId)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanAppointment[];
    },
  });

  const weeks = Array.from({ length: durationWeeks }, (_, i) => i + 1);

  const saveStep = (v: StepInput) => {
    if (editing) {
      updateStep.mutate(
        { ...v, id: editing.id },
        {
          onSuccess: () => {
            setEditing(null);
            toast.success("Step updated");
          },
          onError: () => toast.error("Couldn't save that change — try again"),
        },
      );
      return;
    }
    addStep.mutate(
      { ...v, step_order: schedule.length },
      {
        onSuccess: () => {
          setAddingWeek(null);
          toast.success("Step added to your plan");
        },
        onError: () => toast.error("Couldn't add that step — try again"),
      },
    );
  };

  const dropStep = () => {
    if (!editing) return;
    removeStep.mutate(editing.id, {
      onSuccess: () => {
        setEditing(null);
        toast.success("Step removed");
      },
      onError: () => toast.error("Couldn't remove that step just now"),
    });
  };

  const busy = addStep.isPending || updateStep.isPending || removeStep.isPending;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <SectionLabel className="px-0 mt-0 mb-1.5">The plan, week by week</SectionLabel>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setAddingWeek(currentWeek);
            }}
            className="font-body text-[12px] text-primary underline underline-offset-2 mb-1.5"
          >
            Add a step
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {weeks.map((week) => {
          const { start, end } = weekRange(startDate, week);
          const steps = schedule.filter((r) => appliesInWeek(r, week));
          const visits = appointments.filter(
            (a) => a.appointment_date >= start && a.appointment_date <= end,
          );
          const open = openWeek === week;
          const isNow = week === currentWeek;

          return (
            <SurfaceCard key={week} className={cn("space-y-2", isNow && "border-primary/50")}>
              <button
                type="button"
                onClick={() => setOpenWeek(open ? null : week)}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="font-body text-[14px] font-semibold">
                    Week {week}
                    {isNow ? " · this week" : ""}
                  </p>
                  <p className="font-body text-[12px] text-muted-foreground">
                    {format(fromDateKey(start), "d MMM")} – {format(fromDateKey(end), "d MMM")} ·{" "}
                    {steps.length} step{steps.length === 1 ? "" : "s"}
                    {visits.length ? ` · ${visits.length} appointment${visits.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <ChevronDown
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                />
              </button>

              {open && (
                <div className="space-y-2 pt-1">
                  {steps.length === 0 ? (
                    <p className="font-body text-[13px] text-muted-foreground leading-snug">
                      Nothing planned for this week yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {steps.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-border px-3 py-2 flex items-start gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-body text-[13px] font-semibold break-words">{row.task_name}</p>
                            <p className="font-body text-[11px] text-muted-foreground">
                              {cadenceSummary(row, startDate)}
                            </p>
                          </div>
                          {!disabled && (
                            <button
                              type="button"
                              aria-label={`Edit ${row.task_name}`}
                              onClick={() => {
                                setAddingWeek(null);
                                setEditing(row);
                              }}
                              className="text-muted-foreground min-h-[32px]"
                            >
                              <Pencil className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {visits.map((a) => {
                    const off = a.status === "cancelled";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => navigate(`/appointments/log?fromId=${a.id}&planId=${planId}`)}
                        className={`w-full text-left rounded-xl border px-3 py-2 ${off ? "border-destructive/25 opacity-70" : "border-border"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-body text-[13px] font-semibold break-words ${off ? "line-through text-muted-foreground" : ""}`}>
                            {a.professional_name}
                          </p>
                          {off && (
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                              Cancelled
                            </span>
                          )}
                        </div>
                        <p className="font-body text-[11px] text-muted-foreground">
                          {format(fromDateKey(a.appointment_date), "EEE d MMM")}
                          {a.appointment_time ? ` · ${a.appointment_time}` : ""} · tap to change
                        </p>
                      </button>
                    );
                  })}


                  {!disabled && (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-pill"
                        onClick={() => {
                          setEditing(null);
                          setAddingWeek(week);
                        }}
                      >
                        <Plus className="size-3.5 mr-1" /> Step in week {week}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-pill"
                        onClick={() => navigate(`/appointments/log?planId=${planId}&date=${start}`)}
                      >
                        <CalendarPlus className="size-3.5 mr-1" /> Appointment
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </SurfaceCard>
          );
        })}
      </div>

      <StepEditorSheet
        open={!!editing || addingWeek != null}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setAddingWeek(null);
          }
        }}
        planId={planId}
        durationWeeks={durationWeeks}
        row={editing ?? undefined}
        defaultStartWeek={addingWeek}
        saving={busy}
        onSave={saveStep}
        onDelete={editing ? dropStep : undefined}
        key={editing?.id ?? `add-${addingWeek ?? "x"}`}
      />
    </div>
  );
};

export default PlanTimeline;
