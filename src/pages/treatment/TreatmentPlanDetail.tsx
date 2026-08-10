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
import { useSetPlanStatus, useTreatmentPlan } from "@/hooks/useTreatmentPlans";
import { useTreatmentCheckins } from "@/hooks/useTreatmentCheckin";
import {
  cadenceSummary,
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
  const { bundle, loading } = useTreatmentPlan(id);
  const setStatus = useSetPlanStatus();
  const { checkins } = useTreatmentCheckins(id);

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

  const seeProgress = () => navigate(`/treatment/${plan.id}/progress`);

  const openCheckin = (week: number) => navigate(`/treatment/${plan.id}/checkin/${week}`);

  const currentWeek = Math.max(
    1,
    Math.min(plan.duration_weeks, weekNumberFor(plan.start_date, todayKey())),
  );
  const doneWeeks = new Set(
    checkins.filter((c) => c.submitted_at).map((c) => c.week_number),
  );


  const notYet = () =>
    toast("Editing your schedule arrives with the check-in screens — pause or resume any time meanwhile.");

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
            onClick={notYet}
            aria-label="Edit plan"
            className="size-9 rounded-full bg-card border border-border flex items-center justify-center shrink-0 text-foreground/80"
          >
            <Pencil className="size-4" />
          </button>
        </div>

        {plan.goal && (
          <SurfaceCard tone="gold">
            <SectionLabel className="px-0 mt-0 mb-1.5">What you're hoping for</SectionLabel>
            <p className="font-body text-[14px] leading-snug mt-1 [overflow-wrap:anywhere]">{plan.goal}</p>
          </SurfaceCard>
        )}

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

        {/* actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button className="rounded-pill col-span-2" onClick={() => openCheckin(currentWeek)}>
            <ClipboardCheck className="size-4 mr-1.5" />
            {doneWeeks.has(currentWeek) ? `Week ${currentWeek} check-in` : `Week ${currentWeek} check-in`}
          </Button>
          <Button variant="outline" className="rounded-pill" onClick={seeProgress}>
            <TrendingUp className="size-4 mr-1.5" /> See progress
          </Button>
          <Button variant="outline" className="rounded-pill" onClick={togglePause}>
            {paused ? <Play className="size-4 mr-1.5" /> : <Pause className="size-4 mr-1.5" />}
            {paused ? "Resume plan" : "Pause plan"}
          </Button>
          <Button
            variant="outline"
            className="rounded-pill col-span-2"
            onClick={notYet}
          >
            Edit schedule
          </Button>
        </div>

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
                      {w.state === "future"
                        ? `${w.expectedFull} to come`
                        : `${w.completed} of ${w.expected}${checkedIn ? " · Check-in saved" : ""}`}
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


        {/* schedule */}
        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Your steps</SectionLabel>
          <div className="space-y-1.5">
            {schedule.map((row) => (
              <SurfaceCard key={row.id} className="space-y-0.5">
                <p className="font-display text-[16px] leading-snug break-words">{row.task_name}</p>
                <p className="font-body text-[12px] text-muted-foreground">
                  {cadenceSummary(row, plan.start_date)}
                </p>
                {row.instructions && (
                  <p className="font-body text-[13px] text-muted-foreground leading-snug pt-1 [overflow-wrap:anywhere]">
                    {row.instructions}
                  </p>
                )}
              </SurfaceCard>
            ))}
          </div>
        </div>

        {/* products */}
        {products.length > 0 && (
          <div className="space-y-2">
            <SectionLabel className="px-0 mt-0 mb-1.5">Products</SectionLabel>
            <div className="space-y-1.5">
              {products.map((p) => (
                <SurfaceCard key={p.id} className="space-y-0.5">
                  <p className="font-body text-[14px] font-semibold break-words">{p.product_name}</p>
                  {p.brand && <p className="font-body text-[12px] text-muted-foreground">{p.brand}</p>}
                  {p.usage_notes && (
                    <p className="font-body text-[13px] text-muted-foreground leading-snug pt-1 [overflow-wrap:anywhere]">
                      {p.usage_notes}
                    </p>
                  )}
                </SurfaceCard>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default TreatmentPlanDetail;
