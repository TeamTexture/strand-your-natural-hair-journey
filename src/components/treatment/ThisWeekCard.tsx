import { useState } from "react";
import { format } from "date-fns";
import { Camera, History } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import ProductThumb from "@/components/ProductThumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import CatchUpDays from "@/components/treatment/CatchUpDays";
import WeekDayTicks from "@/components/treatment/WeekDayTicks";
import PlanAppointmentRow, {
  usePlanAppointments,
} from "@/components/treatment/PlanAppointmentRow";
import type { PlanBundle } from "@/hooks/useTreatmentPlans";
import {
  appliesInWeek,
  cadenceSummary,
  fromDateKey,
  weekRange,
} from "@/lib/treatmentSchedule";

/**
 * THIS WEEK — the only thing open when the page loads. The steps that apply
 * right now, a row of day circles per step, and anything else that belongs to
 * this week. The single place the current week's steps and ticks render.
 */
const ThisWeekCard = ({
  bundle,
  currentWeek,
  isMilestone,
  disabled,
}: {
  bundle: PlanBundle;
  currentWeek: number;
  isMilestone: boolean;
  disabled?: boolean;
}) => {
  const { plan, schedule, entries, products } = bundle;
  const [catchUp, setCatchUp] = useState(false);
  const appointments = usePlanAppointments(plan.id);

  const { start, end } = weekRange(plan.start_date, currentWeek);
  const steps = [...schedule]
    .filter((r) => appliesInWeek(r, currentWeek))
    .sort((a, b) => a.step_order - b.step_order);
  const visits = appointments.filter(
    (a) => a.appointment_date >= start && a.appointment_date <= end,
  );
  const productFor = (id: string | null) => (id ? products.find((p) => p.id === id) ?? null : null);

  return (
    <>
      <SurfaceCard padded={false} className="overflow-hidden">
        <div className="flex items-start gap-2 px-4 pt-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-body text-[10px] uppercase tracking-[0.18em] text-primary">
              This week
            </p>
            <h2 className="font-display text-[20px] leading-tight mt-0.5">Week {currentWeek}</h2>
            <p className="font-body text-[11.5px] text-muted-foreground mt-0.5">
              {format(fromDateKey(start), "d MMM")} – {format(fromDateKey(end), "d MMM")}
            </p>
          </div>
          {isMilestone && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-pill bg-primary/12 px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              <Camera className="size-3" /> Photo week
            </span>
          )}
        </div>

        <div className="px-4 pt-3 pb-4 space-y-3">
          {steps.length === 0 ? (
            <p className="font-body text-[13px] text-muted-foreground leading-snug">
              Nothing planned for this week. Open the plan below to add a step.
            </p>
          ) : (
            steps.map((row) => {
              const product = productFor(row.product_id);
              return (
                <div
                  key={row.id}
                  className="rounded-[12px] border border-border/70 bg-background/60 p-3 space-y-2"
                >
                  <div className="min-w-0">
                    <p className="font-body text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">
                      {row.task_name}
                    </p>
                    <p className="font-body text-[11.5px] text-muted-foreground mt-0.5">
                      {cadenceSummary(row, plan.start_date)}
                    </p>
                  </div>

                  {row.instructions && (
                    <p className="font-body text-[12.5px] leading-snug text-foreground/85 [overflow-wrap:anywhere]">
                      {row.instructions}
                    </p>
                  )}

                  {product && (
                    <div className="flex items-center gap-2.5">
                      <ProductThumb
                        imageUrl={product.image_url}
                        storagePath={product.storage_path}
                        alt={product.product_name}
                        brand={product.brand}
                        name={product.product_name}
                        wrapperClassName="size-9 rounded-[8px] overflow-hidden bg-secondary shrink-0"
                      />
                      <div className="min-w-0">
                        {product.brand && (
                          <p className="font-body text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
                            {product.brand}
                          </p>
                        )}
                        <p className="font-body text-[12px] leading-snug [overflow-wrap:anywhere]">
                          {product.product_name}
                        </p>
                      </div>
                    </div>
                  )}

                  <WeekDayTicks
                    planId={plan.id}
                    row={row}
                    startDate={plan.start_date}
                    weekStart={start}
                    entries={entries}
                    disabled={disabled}
                  />
                </div>
              );
            })
          )}

          {visits.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-body text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                This week's appointment{visits.length === 1 ? "" : "s"}
              </p>
              {visits.map((a) => (
                <PlanAppointmentRow key={a.id} appointment={a} planId={plan.id} />
              ))}
            </div>
          )}

          {plan.status === "active" && (
            <button
              type="button"
              onClick={() => setCatchUp(true)}
              className="flex items-center gap-1.5 font-body text-[12.5px] text-primary underline underline-offset-2"
            >
              <History className="size-3.5" /> Log a day you missed
            </button>
          )}
        </div>
      </SurfaceCard>

      <Dialog open={catchUp} onOpenChange={setCatchUp}>
        <DialogContent className="max-w-[330px] rounded-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-[19px]">Log a day you missed</DialogTitle>
            <DialogDescription className="font-body text-[12.5px]">
              Logging it now still counts — nothing is held against you.
            </DialogDescription>
          </DialogHeader>
          <CatchUpDays bundle={bundle} disabled={disabled} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ThisWeekCard;
