import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useProTemplates,
  useProTreatmentClients,
  type ClientPlanStatus,
  type ProTreatmentClient,
} from "@/hooks/useProTreatment";

const FILTERS: { key: "all" | ClientPlanStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on_track", label: "On track" },
  { key: "quiet", label: "Quiet" },
  { key: "awaiting_upgrade", label: "Awaiting upgrade" },
];

const statusChip = (c: ProTreatmentClient) => {
  if (c.planStatus === "awaiting_upgrade")
    return { label: "Awaiting upgrade", tone: "warn" as const };
  if (c.planStatus === "not_started") return { label: "Not started", tone: "muted" as const };
  if (c.planStatus === "quiet")
    return { label: `Quiet · ${c.quietDays} days`, tone: "warn" as const };
  return { label: "On track", tone: "good" as const };
};

const AdherenceMeter = ({ percent }: { percent: number }) => (
  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
  </div>
);

/** Clients on a plan — quiet first, because that's who needs a word. */
const ProTreatmentClients = () => {
  const nav = useNavigate();
  const { clients, loading } = useProTreatmentClients();
  const { templates } = useProTemplates();
  const [filter, setFilter] = useState<"all" | ClientPlanStatus>("all");

  const rows = useMemo(
    () => (filter === "all" ? clients : clients.filter((c) => c.planStatus === filter)),
    [clients, filter],
  );

  return (
    <ScreenLayout>
      <TitleBar title="Treatment plans" backFallback="/pro" />

      <div className="px-5 pt-1 pb-10 space-y-4">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-pill px-3 py-1.5 font-body text-[12px] border",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground/80 border-border",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingDot />
        ) : clients.length === 0 ? (
          <EmptyState
            icon="🌱"
            message="No one is on a plan with you yet."
            hint="Build a template once, then assign it to a client in a couple of taps."
            action={
              <Button className="rounded-pill" onClick={() => nav("/pro/treatment/templates/new")}>
                Build a template
              </Button>
            }
          />
        ) : (
          <div className="space-y-1.5">
            {rows.map((c) => {
              const chip = statusChip(c);
              const openable = !!c.plan;
              return (
                <SurfaceCard
                  key={c.assignment_id}
                  padded={false}
                  className="px-4 py-3 space-y-2"
                  role={openable ? "button" : undefined}
                  tabIndex={openable ? 0 : undefined}
                  onClick={
                    openable
                      ? () => nav(`/pro/treatment/plan/${c.plan!.id}/week/${c.weekNumber}`)
                      : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[14px] font-semibold [overflow-wrap:anywhere]">
                        {c.client_name}
                      </p>
                      <p className="font-body text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                        {c.plan?.title ?? c.template_title ?? "Treatment plan"}
                        {c.plan ? ` · week ${c.weekNumber} of ${c.plan.duration_weeks}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold",
                        chip.tone === "good" && "bg-good/15 text-good",
                        chip.tone === "warn" && "bg-primary/10 text-primary",
                        chip.tone === "muted" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {chip.label}
                    </span>
                    {openable && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                  </div>
                  {c.plan && (
                    <div className="space-y-1">
                      <AdherenceMeter percent={c.adherencePercent} />
                      <p className="font-body text-[11px] text-muted-foreground">{c.adherenceLine}</p>
                    </div>
                  )}
                </SurfaceCard>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Templates</SectionLabel>
          <div className="space-y-1.5">
            {templates.map((t) => (
              <SurfaceCard
                key={t.id}
                padded={false}
                className="px-4 py-3 flex items-center gap-3"
                role="button"
                tabIndex={0}
                onClick={() => nav(`/pro/treatment/templates/${t.id}`)}
              >
                <ClipboardList className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-body text-[14px] font-semibold [overflow-wrap:anywhere]">
                    {t.title}
                  </p>
                  <p className="font-body text-[12px] text-muted-foreground">
                    {t.duration_weeks} weeks · {t.steps.length} steps · used with {t.usedWith}{" "}
                    {t.usedWith === 1 ? "client" : "clients"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </SurfaceCard>
            ))}
            <Button
              variant="outline"
              className="rounded-pill w-full"
              onClick={() => nav("/pro/treatment/templates/new")}
            >
              <Plus className="size-4 mr-1.5" /> New template
            </Button>
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProTreatmentClients;
