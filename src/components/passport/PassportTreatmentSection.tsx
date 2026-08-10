import { useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CheckinReview from "@/components/treatment/CheckinReview";
import { usePassportTreatment, type PassportPlan } from "@/hooks/usePassportTreatment";
import { formatDate } from "@/lib/formatPassportDate";
import { titleCase } from "@/lib/humanise";

const Meter = ({ percent }: { percent: number }) => (
  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
  </div>
);

/**
 * Treatment plans inside the client passport.
 *
 * The passport widens nothing. A plan the professional has no accepted
 * assignment or accepted share on shows as a title and a status and nothing
 * else — no schedule, no tick-offs, no ratings, no notes, no media.
 */
const PassportTreatmentSection = ({
  clientUserId,
  clientName,
  onOpenCheckin,
}: {
  clientUserId: string;
  clientName: string;
  onOpenCheckin?: (planId: string, week: number) => void;
}) => {
  const { plans, loading } = usePassportTreatment(clientUserId);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const firstName = (clientName || "They").split(/\s+/)[0];

  if (loading) return <LoadingDot label="Loading treatment plans…" fullScreen={false} />;

  if (plans.length === 0) {
    return (
      <div className="px-5">
        <p className="font-body text-[13px] text-muted-foreground leading-snug">
          No treatment plans on this account.
        </p>
      </div>
    );
  }

  const locked = plans.filter((p) => !p.has_plan_access);
  const visible = plans.filter((p) => p.has_plan_access);

  return (
    <div className="px-5 space-y-4">
      {visible.map((p) => (
        <PlanCard
          key={p.plan_id}
          plan={p}
          firstName={firstName}
          expanded={openPlan === p.plan_id}
          onToggle={() => setOpenPlan(openPlan === p.plan_id ? null : p.plan_id)}
          onOpenCheckin={onOpenCheckin}
        />
      ))}

      {locked.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel className="px-0 mt-0 mb-1.5">Not shared with you</SectionLabel>
          {locked.map((p) => (
            <SurfaceCard key={p.plan_id} padded={false} className="px-4 py-3 flex items-center gap-3">
              <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-body text-[14px] font-semibold [overflow-wrap:anywhere]">
                  {p.title}
                </p>
                <p className="font-body text-[12px] text-muted-foreground">
                  {titleCase(p.status)}
                </p>
              </div>
            </SurfaceCard>
          ))}
          <p className="font-body text-[12px] text-muted-foreground leading-snug">
            {firstName} hasn't accepted you onto {locked.length === 1 ? "this plan" : "these plans"},
            so nothing inside it is visible.
          </p>
        </div>
      )}
    </div>
  );
};

const PlanCard = ({
  plan,
  firstName,
  expanded,
  onToggle,
  onOpenCheckin,
}: {
  plan: PassportPlan;
  firstName: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenCheckin?: (planId: string, week: number) => void;
}) => {
  const submitted = plan.checkins.filter((c) => c.submitted_at);
  return (
    <SurfaceCard className="space-y-3">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] leading-tight [overflow-wrap:anywhere]">
              {plan.title}
            </p>
            <p className="font-body text-[12px] text-muted-foreground mt-0.5">
              Week {plan.weekNumber} of {plan.duration_weeks} · {titleCase(plan.status)} · started{" "}
              {formatDate(plan.start_date)}
            </p>
          </div>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
        </div>
        <div className="mt-2 space-y-1">
          <Meter percent={plan.adherencePercent} />
          <p className="font-body text-[11px] text-muted-foreground">{plan.adherenceLine}</p>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 pt-1 border-t border-border">
          {plan.schedule.length > 0 && (
            <div className="space-y-1.5">
              <SectionLabel className="px-0 mt-0 mb-1.5">The plan</SectionLabel>
              {plan.schedule.map((s) => (
                <p
                  key={s.id}
                  className="font-body text-[13px] leading-snug [overflow-wrap:anywhere]"
                >
                  {s.task_name}
                </p>
              ))}
            </div>
          )}

          {plan.products.length > 0 && (
            <div className="space-y-1">
              <SectionLabel className="px-0 mt-0 mb-1.5">Products on the plan</SectionLabel>
              {plan.products.map((pr) => (
                <p key={pr.id} className="font-body text-[13px] [overflow-wrap:anywhere]">
                  {pr.product_name}
                  {pr.brand ? ` · ${pr.brand}` : ""}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <SectionLabel className="px-0 mt-0 mb-1.5">Week by week</SectionLabel>
            {plan.weeks.map((w) => (
              <div key={w.week} className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-body text-[12px] flex-1">Week {w.week}</p>
                  <p className="font-body text-[12px] text-muted-foreground shrink-0">
                    {w.logged} of {w.due}
                  </p>
                </div>
                <Meter percent={w.percent} />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <SectionLabel className="px-0 mt-0 mb-1.5">Check-ins</SectionLabel>
            {submitted.length === 0 ? (
              <p className="font-body text-[13px] text-muted-foreground">
                {firstName} hasn't saved a check-in yet.
              </p>
            ) : (
              submitted.map((c) => (
                <div key={c.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="font-body text-[13px] font-semibold flex-1">
                      Week {c.week_number}
                    </p>
                    {onOpenCheckin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-pill shrink-0 h-8 text-[11px]"
                        onClick={() => onOpenCheckin(plan.plan_id, c.week_number)}
                      >
                        Open review
                      </Button>
                    )}
                  </div>
                  <CheckinReview
                    weekNumber={c.week_number}
                    ratings={c.ratings ?? {}}
                    note={c.written_note}
                    media={c.media ?? []}
                    mediaShared={plan.has_media_access}
                    firstName={firstName}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};

export default PassportTreatmentSection;
