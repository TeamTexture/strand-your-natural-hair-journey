import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarPlus,
  Camera,
  Check,
  ChevronDown,
  Copy,
  ListOrdered,
  Pencil,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import ProductThumb from "@/components/ProductThumb";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import StepEditorSheet from "@/components/treatment/StepEditorSheet";
import PlanProductsSection, { type PlanProduct } from "@/components/treatment/PlanProductsSection";
import PlanAppointmentRow, {
  usePlanAppointments,
} from "@/components/treatment/PlanAppointmentRow";
import { useChallenges } from "@/hooks/useChallenges";
import {
  appliesInWeek,
  cadenceSummary,
  fromDateKey,
  todayKey,
  weekNumberFor,
  weekRange,
  type ScheduleRow,
  type WeekSummary,
} from "@/lib/treatmentSchedule";
import { usePlanScheduleEditor, type StepInput } from "@/hooks/useTreatmentPlans";

interface Props {
  planId: string;
  startDate: string;
  durationWeeks: number;
  schedule: ScheduleRow[];
  /** Week rows, already derived by the date engine. */
  weeks: WeekSummary[];
  /** Weeks with a submitted check-in. */
  checkedInWeeks: Set<number>;
  goal: string | null;
  products: PlanProduct[];
  onProductsChanged: () => void;
  onCheckin: (week: number) => void;
  /** Read-only when the plan is paused or she isn't on STRAND+. */
  disabled?: boolean;
}

/** current | needs check-in | checked in | ahead */
type Tier = "a" | "b" | "c" | "d";

const tierOf = (w: WeekSummary, checkedIn: boolean): Tier => {
  if (w.state === "current") return "a";
  if (w.state === "future") return "d";
  return checkedIn ? "c" : "b";
};

/**
 * THE PLAN — the whole treatment in one place: a quiet line for what she's
 * hoping for and working against, then every week, then the products and the
 * full step sequence at the foot. This is the only week list on the page and
 * the only place a step, product or appointment gets edited.
 */
const PlanTimeline = ({
  planId,
  startDate,
  durationWeeks,
  schedule,
  weeks,
  checkedInWeeks,
  goal,
  products,
  onProductsChanged,
  onCheckin,
  disabled,
}: Props) => {
  const navigate = useNavigate();
  const { challenges } = useChallenges();
  const { addStep, updateStep, removeStep } = usePlanScheduleEditor(planId);
  const appointments = usePlanAppointments(planId);

  const currentWeek = Math.max(1, Math.min(durationWeeks, weekNumberFor(startDate, todayKey())));
  const [open, setOpen] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(currentWeek);
  const [allSteps, setAllSteps] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [addingWeek, setAddingWeek] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  // Product names for steps that have one attached.
  const { data: planProducts = [] } = useQuery({
    queryKey: ["plan-products-picker", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: unknown; error: unknown }> };
        };
      })
        .from("treatment_plan_products")
        .select("id, product_name, brand, image_url, storage_path")
        .eq("plan_id", planId);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        product_name: string;
        brand: string | null;
        image_url: string | null;
        storage_path: string | null;
      }[];
    },
  });
  const productFor = (id: string | null) =>
    id ? planProducts.find((p) => p.id === id) ?? null : null;

  const orderedSteps = [...schedule].sort((a, b) => a.step_order - b.step_order);

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

  /**
   * Whole treatments often run on the same products from start to finish. This
   * takes the products attached to one week's steps and puts them on every
   * other step in the plan, matching by step name where it can.
   */
  const applyProductsEverywhere = async (week: number) => {
    const source = schedule.filter((r) => appliesInWeek(r, week) && r.product_id);
    if (source.length === 0) {
      toast.error("Attach a product to a step in this week first");
      return;
    }
    const byName = new Map(source.map((r) => [r.task_name.trim().toLowerCase(), r.product_id!]));
    const fallback = source[0].product_id!;
    const targets = schedule.filter((r) => !r.product_id);
    if (targets.length === 0) {
      toast.success("Every step already has a product");
      return;
    }
    setCopying(true);
    try {
      for (const row of targets) {
        await updateStep.mutateAsync({
          id: row.id,
          task_name: row.task_name,
          instructions: row.instructions ?? null,
          cadence: row.cadence,
          days_of_week: row.days_of_week ?? null,
          time_of_day: row.time_of_day,
          start_week: row.start_week ?? null,
          end_week: row.end_week ?? null,
          product_id: byName.get(row.task_name.trim().toLowerCase()) ?? fallback,
        });
      }
      toast.success(`Products applied to ${targets.length} step${targets.length === 1 ? "" : "s"}`);
    } catch (e) {
      console.error("apply products everywhere failed", e);
      toast.error("Couldn't apply those products just now");
    } finally {
      setCopying(false);
    }
  };

  return (
    <SurfaceCard padded={false} className="overflow-hidden">
      {/* the accordion itself, closed by default */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-body text-[14px] font-semibold">The plan</p>
          <p className="font-body text-[11.5px] text-muted-foreground mt-0.5">
            {durationWeeks} week{durationWeeks === 1 ? "" : "s"} · {orderedSteps.length} step
            {orderedSteps.length === 1 ? "" : "s"} · every week, and where you change it
          </p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          {/* what she's hoping for, and working against — one quiet line */}
          {(goal || challenges.length > 0) && (
            <p className="font-body text-[12.5px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
              {goal ? <span className="text-foreground">{goal}</span> : null}
              {goal && challenges.length > 0 ? " · " : ""}
              {challenges.length > 0 ? `Working against ${challenges.join(", ")}` : ""}
            </p>
          )}

          {/* the single week list */}
          <div className="space-y-1.5">
            {weeks.map((w) => {
              const week = w.week;
              const checkedIn = checkedInWeeks.has(week);
              const tier = tierOf(w, checkedIn);
              const isOpen = openWeek === week;
              const { start, end } = weekRange(startDate, week);
              const steps = schedule
                .filter((r) => appliesInWeek(r, week))
                .sort((a, b) => a.step_order - b.step_order);
              const visits = appointments.filter(
                (a) => a.appointment_date >= start && a.appointment_date <= end,
              );

              const shell = {
                a: "bg-primary border-primary text-primary-foreground",
                b: "bg-card border-primary border-[1.5px]",
                c: "bg-card border-border",
                d: "bg-secondary/60 border-border/60 text-muted-foreground",
              }[tier];

              const eyebrow = {
                a: "text-primary-foreground/75",
                b: "text-primary",
                c: "text-muted-foreground",
                d: "text-muted-foreground",
              }[tier];

              const meta = {
                a: "text-primary-foreground/80",
                b: "text-muted-foreground",
                c: "text-muted-foreground",
                d: "text-muted-foreground",
              }[tier];

              return (
                <SurfaceCard key={week} padded={false} className={cn("overflow-hidden", shell)}>
                  <button
                    type="button"
                    onClick={() => setOpenWeek(isOpen ? null : week)}
                    aria-expanded={isOpen}
                    className="w-full px-4 py-3.5 text-left"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "font-body text-[10px] uppercase tracking-[0.18em]",
                            eyebrow,
                          )}
                        >
                          {tier === "a" ? "This week" : tier === "d" ? "Ahead" : "Week"}
                        </p>
                        <p
                          className={cn(
                            "font-display leading-tight mt-0.5",
                            tier === "a" ? "text-[24px]" : "text-[17px]",
                          )}
                        >
                          Week {week}
                        </p>
                        <p className={cn("font-body text-[11.5px] mt-1", meta)}>
                          {format(fromDateKey(start), "d MMM")} – {format(fromDateKey(end), "d MMM")}{" "}
                          · {w.line}
                        </p>
                        {tier === "c" && (
                          <p className="mt-1 flex items-center gap-1.5 font-body text-[11.5px] text-muted-foreground">
                            <span className="size-4 rounded-full bg-good/15 text-good flex items-center justify-center">
                              <Check className="size-2.5" />
                            </span>
                            Check-in saved
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 flex items-center gap-1.5">
                        {w.isMilestone && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-body text-[10px] font-semibold",
                              tier === "a"
                                ? "bg-background/25 text-primary-foreground"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            <Camera className="size-3" /> Photo
                          </span>
                        )}
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            tier === "a" ? "text-primary-foreground/80" : "text-muted-foreground",
                            isOpen && "rotate-180",
                          )}
                        />
                      </span>
                    </div>
                  </button>

                  {/* the check-in affordance, per tier */}
                  {tier === "a" && (
                    <div className="px-4 pb-3.5">
                      <Button
                        className="rounded-pill w-full bg-background text-primary hover:bg-background/90"
                        onClick={() => onCheckin(week)}
                      >
                        Check in for week {week}
                      </Button>
                    </div>
                  )}
                  {tier === "b" && (
                    <div className="px-4 pb-3.5 space-y-1.5">
                      <p className="font-body text-[12px] text-muted-foreground leading-snug">
                        No check-in for this week yet, which is completely fine — you can still
                        write it now.
                      </p>
                      <Button
                        variant="outline"
                        className="rounded-pill w-full"
                        onClick={() => onCheckin(week)}
                      >
                        Check in for week {week}
                      </Button>
                    </div>
                  )}
                  {tier === "c" && (
                    <div className="px-4 pb-3.5">
                      <button
                        type="button"
                        onClick={() => onCheckin(week)}
                        className="font-body text-[12px] text-primary underline underline-offset-2"
                      >
                        Read your week {week} check-in
                      </button>
                    </div>
                  )}

                  {isOpen && (
                    <div
                      className={cn(
                        "space-y-2 px-4 pb-4 pt-3 border-t",
                        tier === "a" ? "border-primary-foreground/20" : "border-border/60",
                      )}
                    >
                      {steps.length === 0 ? (
                        <p
                          className={cn(
                            "font-body text-[13px] leading-snug",
                            tier === "a" ? "text-primary-foreground/85" : "text-muted-foreground",
                          )}
                        >
                          Nothing planned for this week yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {steps.map((row) => (
                            <div
                              key={row.id}
                              className={cn(
                                "rounded-xl border px-3 py-2 flex items-start gap-2",
                                tier === "a"
                                  ? "border-primary-foreground/25 bg-background/10"
                                  : "border-border",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-body text-[13px] font-semibold break-words">
                                  {row.task_name}
                                </p>
                                <p
                                  className={cn(
                                    "font-body text-[11px]",
                                    tier === "a"
                                      ? "text-primary-foreground/80"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {cadenceSummary(row, startDate)}
                                </p>
                                {productFor(row.product_id) && (
                                  <span className="mt-1 flex items-center gap-1.5">
                                    <ProductThumb
                                      imageUrl={productFor(row.product_id)!.image_url}
                                      storagePath={productFor(row.product_id)!.storage_path}
                                      alt={productFor(row.product_id)!.product_name}
                                      brand={productFor(row.product_id)!.brand}
                                      name={productFor(row.product_id)!.product_name}
                                      wrapperClassName="size-6 rounded-[6px] overflow-hidden bg-secondary shrink-0"
                                    />
                                    <span
                                      className={cn(
                                        "font-body text-[11px] break-words",
                                        tier === "a" ? "text-primary-foreground" : "text-primary",
                                      )}
                                    >
                                      {productFor(row.product_id)!.product_name}
                                    </span>
                                  </span>
                                )}
                              </div>
                              {!disabled && (
                                <button
                                  type="button"
                                  aria-label={`Edit ${row.task_name}`}
                                  onClick={() => {
                                    setAddingWeek(null);
                                    setEditing(row);
                                  }}
                                  className={cn(
                                    "min-h-[32px]",
                                    tier === "a"
                                      ? "text-primary-foreground/85"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  <Pencil className="size-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {visits.map((a) => (
                        <PlanAppointmentRow key={a.id} appointment={a} planId={planId} />
                      ))}

                      {!disabled && (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-pill bg-background"
                            onClick={() => {
                              setEditing(null);
                              setAddingWeek(week);
                            }}
                          >
                            <Plus className="size-3.5 mr-1" /> Add step &amp; product
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-pill bg-background"
                            onClick={() => navigate(`/appointments/log?planId=${planId}&date=${start}`)}
                          >
                            <CalendarPlus className="size-3.5 mr-1" /> Appointment
                          </Button>
                          {steps.some((r) => r.product_id) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-pill w-full bg-background"
                              disabled={copying}
                              onClick={() => void applyProductsEverywhere(week)}
                            >
                              <Copy className="size-3.5 mr-1" /> Use these products for every week
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </SurfaceCard>
              );
            })}
          </div>

          {/* the whole protocol, one tap away */}
          {orderedSteps.length > 0 && (
            <SurfaceCard padded={false} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setAllSteps((v) => !v)}
                aria-expanded={allSteps}
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                <ListOrdered className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 font-body text-[13.5px] font-semibold">
                  All steps
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    allSteps && "rotate-180",
                  )}
                />
              </button>
              {allSteps && (
                <ul className="px-4 pb-4 space-y-2.5 border-t border-border/60 pt-3">
                  {orderedSteps.map((s, i) => (
                    <li key={s.id} className="flex items-start gap-3 min-w-0">
                      <span className="mt-[1px] size-6 rounded-full border border-border/70 bg-background flex items-center justify-center shrink-0 font-display text-[11px] leading-none text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-body text-[13.5px] font-medium leading-snug break-words">
                          {s.task_name}
                        </p>
                        <p className="font-body text-[11px] text-muted-foreground leading-snug">
                          {cadenceSummary(s, startDate)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SurfaceCard>
          )}

          {/* the products this plan runs on */}
          <PlanProductsSection
            planId={planId}
            products={products}
            schedule={schedule}
            canEdit={!disabled}
            onChanged={onProductsChanged}
          />
        </div>
      )}

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
    </SurfaceCard>
  );
};

export default PlanTimeline;
