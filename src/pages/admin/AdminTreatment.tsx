import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ClipboardList } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdminPlans, useAdminTemplates, type PlanSource } from "@/hooks/useAdminTreatment";

type Filter = "all" | PlanSource;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admin-assigned" },
  { key: "professional", label: "Pro-assigned" },
  { key: "self", label: "Self-created" },
];

const SOURCE_LABEL: Record<PlanSource, string> = {
  admin: "Assigned by STRAND",
  professional: "Assigned by a professional",
  self: "Built by the member",
};

const Chip = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-pill px-3 py-1.5 font-body text-[12px] border whitespace-nowrap",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground/80 border-border",
    )}
  >
    {children}
  </button>
);

/** Admin treatment plan management: admin-owned templates plus platform oversight. */
const AdminTreatment = () => {
  const nav = useNavigate();
  const { plans, loading } = useAdminPlans();
  const { templates } = useAdminTemplates();
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(
    () => (filter === "all" ? plans : plans.filter((p) => p.source === filter)),
    [plans, filter],
  );

  return (
    <ScreenLayout>
      <TitleBar title="Treatment plans" backFallback="/admin" />

      <div className="px-5 pt-1 pb-10 space-y-5">
        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">STRAND templates</SectionLabel>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => nav(`/admin/treatment/templates/${t.id}`)}
              className="w-full text-left"
            >
              <SurfaceCard className="space-y-0.5">
                <p className="font-display text-[15px] leading-tight">{t.title}</p>
                <p className="font-body text-[12px] text-muted-foreground">
                  {t.duration_weeks} weeks · {t.steps.length} step{t.steps.length === 1 ? "" : "s"} ·
                  used with {t.usedWith} {t.usedWith === 1 ? "member" : "members"}
                </p>
              </SurfaceCard>
            </button>
          ))}
          <Button
            variant="outline"
            className="rounded-pill w-full"
            onClick={() => nav("/admin/treatment/templates/new")}
          >
            <Plus className="size-4 mr-1.5" /> New template
          </Button>
        </div>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Plans on the platform</SectionLabel>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {FILTERS.map((f) => (
              <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </Chip>
            ))}
          </div>

          {loading ? (
            <LoadingDot />
          ) : shown.length === 0 ? (
            <SurfaceCard className="flex items-start gap-3">
              <ClipboardList className="size-4 mt-0.5 text-muted-foreground" />
              <p className="font-body text-[13px] text-muted-foreground leading-snug">
                No plans in this view yet. Build a template and assign it to get one going.
              </p>
            </SurfaceCard>
          ) : (
            shown.map((p) => (
              <button
                key={p.plan_id}
                onClick={() => nav(`/admin/treatment/plan/${p.plan_id}`)}
                className="w-full text-left"
              >
                <SurfaceCard className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-[15px] leading-tight [overflow-wrap:anywhere]">
                        {p.owner_name}
                      </p>
                      <p className="font-body text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                        {p.title}
                      </p>
                    </div>
                    <span className="rounded-pill border border-border px-2 py-0.5 font-body text-[11px] text-foreground/70 shrink-0">
                      Week {p.weekNumber} of {p.duration_weeks}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, p.adherencePercent)}%` }}
                    />
                  </div>
                  <p className="font-body text-[12px] text-muted-foreground">
                    {p.adherenceLine} · {SOURCE_LABEL[p.source]}
                    {p.source !== "self" && p.assigner_name ? ` (${p.assigner_name})` : ""}
                  </p>
                </SurfaceCard>
              </button>
            ))
          )}
        </div>
      </div>
    </ScreenLayout>
  );
};

export default AdminTreatment;
