import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Info, Trash2, ImageOff } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandTagList from "@/components/brand/BrandTagList";
import BrandTagControl from "@/components/brand/BrandTagControl";
import {
  useAdminPlan,
  usePlanProTagActions,
  useProfessionalOptions,
} from "@/hooks/useAdminTreatment";
import { cadenceSummary, weekBreakdown } from "@/lib/treatmentSchedule";

/** Admin view of a single plan: oversight, credit tagging, consent-gated media. */
const AdminTreatmentPlan = () => {
  const { planId } = useParams();
  const { plan, loading } = useAdminPlan(planId);
  const { professionals } = useProfessionalOptions();
  const { add, remove } = usePlanProTagActions();
  const [proId, setProId] = useState("");
  const [label, setLabel] = useState("Reviewing trichologist");

  const weeks = useMemo(
    () => (plan ? weekBreakdown(plan.schedule, plan.entries, plan.start_date, plan.duration_weeks) : []),
    [plan],
  );

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Plan" backFallback="/admin/treatment" />
        <LoadingDot />
      </ScreenLayout>
    );
  }

  if (!plan) {
    return (
      <ScreenLayout>
        <TitleBar title="Plan" backFallback="/admin/treatment" />
        <div className="px-5">
          <SurfaceCard>
            <p className="font-body text-[13px] text-muted-foreground">
              That plan isn't available.
            </p>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  const untagged = professionals.filter(
    (p) => !plan.pro_tags.some((t) => t.professional_id === p.user_id),
  );

  return (
    <ScreenLayout>
      <TitleBar title="Plan" backFallback="/admin/treatment" />

      <div className="px-5 pt-1 pb-10 space-y-5">
        <SurfaceCard className="space-y-1.5">
          <p className="font-display text-[18px] leading-tight [overflow-wrap:anywhere]">
            {plan.title}
          </p>
          <p className="font-body text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
            {plan.owner_name} · week {plan.weekNumber} of {plan.duration_weeks}
          </p>
          <div className="h-1.5 rounded-pill bg-border overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, plan.adherencePercent)}%` }}
            />
          </div>
          <p className="font-body text-[12px] text-muted-foreground">{plan.adherenceLine}</p>
        </SurfaceCard>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Steps</SectionLabel>
          {plan.schedule.map((s) => (
            <SurfaceCard key={s.id} className="py-3 space-y-0.5">
              <p className="font-display text-[14px] leading-tight [overflow-wrap:anywhere]">
                {s.task_name}
              </p>
              <p className="font-body text-[12px] text-muted-foreground">
                {cadenceSummary(s, plan.start_date)}
              </p>
            </SurfaceCard>
          ))}
        </div>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Week by week</SectionLabel>
          {weeks.map((w) => (
            <SurfaceCard key={w.week} className="py-3 flex items-center justify-between gap-3">
              <p className="font-body text-[13px]">Week {w.week}</p>
              <p className="font-body text-[12px] text-muted-foreground">
                {w.state === "future"
                  ? "Not started yet"
                  : `${w.completed} of ${Math.max(w.expected, w.completed)} done`}
              </p>

            </SurfaceCard>
          ))}
        </div>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Photos, videos and voice notes</SectionLabel>
          {plan.media_sharing_consent ? (
            <SurfaceCard className="space-y-1">
              <p className="font-body text-[13px] leading-snug">
                {plan.owner_name} has chosen to share their media on this plan.
              </p>
              <p className="font-body text-[12px] text-muted-foreground leading-snug">
                Open it from the professional review screen for the relevant check-in.
              </p>
            </SurfaceCard>
          ) : (
            <SurfaceCard className="flex items-start gap-2.5">
              <ImageOff className="size-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="font-body text-[13px] text-muted-foreground leading-snug">
                {plan.owner_name} hasn't shared photos or voice notes.
              </p>
            </SurfaceCard>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Professionals credited</SectionLabel>
          <SurfaceCard className="flex items-start gap-2.5">
            <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="font-body text-[12px] text-muted-foreground leading-snug">
              Tagging is a credit or reference only. It gives that professional no access at all to
              this plan or anything in it — access only ever comes from an assignment the member has
              accepted.
            </p>
          </SurfaceCard>

          {plan.pro_tags.map((t) => (
            <SurfaceCard key={t.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[14px] leading-tight [overflow-wrap:anywhere]">
                  {t.professional_name}
                </p>
                {t.label && (
                  <p className="font-body text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                    {t.label}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Remove credit"
                onClick={() =>
                  remove.mutate(t.id, { onError: () => toast.error("Couldn't remove that") })
                }
                className="size-9 rounded-full border border-border flex items-center justify-center shrink-0 text-muted-foreground"
              >
                <Trash2 className="size-4" />
              </button>
            </SurfaceCard>
          ))}

          <SurfaceCard className="space-y-2">
            <SectionLabel className="px-0 mt-0 mb-0">Add a credit</SectionLabel>
            <select
              value={proId}
              onChange={(e) => setProId(e.target.value)}
              className="w-full h-10 rounded-md border border-border bg-background px-3 font-body text-[13px]"
            >
              <option value="">Choose a professional</option>
              {untagged.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name}
                  {p.discipline ? ` — ${p.discipline}` : ""}
                </option>
              ))}
            </select>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="e.g. Reviewing trichologist"
            />
            <Button
              variant="outline"
              className="rounded-pill w-full"
              disabled={!proId || add.isPending}
              onClick={() =>
                add.mutate(
                  { planId: plan.plan_id, professionalId: proId, label },
                  {
                    onSuccess: () => {
                      setProId("");
                      toast.success("Credit added");
                    },
                    onError: () => toast.error("Couldn't add that credit"),
                  },
                )
              }
            >
              Add credit
            </Button>
          </SurfaceCard>
        </div>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Brands</SectionLabel>
          <BrandTagControl taggableType="treatment_plan" taggableId={plan.plan_id} />
        </div>
      </div>
    </ScreenLayout>
  );
};

export default AdminTreatmentPlan;
