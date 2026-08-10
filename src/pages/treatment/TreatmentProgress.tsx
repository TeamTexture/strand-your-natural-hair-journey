import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Loader2, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTreatmentPlan } from "@/hooks/useTreatmentPlans";
import { useTreatmentCheckins } from "@/hooks/useTreatmentCheckin";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import { formatClock, type TreatmentMediaRow } from "@/lib/treatmentMedia";
import { fromDateKey, toDateKey, weekBreakdown, weekNumberFor } from "@/lib/treatmentSchedule";

/**
 * Progress view. Oldest first everywhere — the sequence is the point.
 * No scores, no grades, nothing red. Future weeks are muted and empty, never
 * shown as misses.
 */

const weekOf = (startDate: string, m: TreatmentMediaRow) =>
  Math.max(1, weekNumberFor(startDate, toDateKey(new Date(m.captured_at))));

const TreatmentProgress = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bundle, loading } = useTreatmentPlan(id);
  const { media, loading: mediaLoading } = useTreatmentCheckins(id);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const photos = useMemo(
    () =>
      media
        .filter((m) => m.media_type === "photo")
        .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [media],
  );
  const voice = useMemo(
    () =>
      media
        .filter((m) => m.media_type === "audio")
        .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [media],
  );

  const { urls } = useSignedMedia([...photos, ...voice].map((m) => m.storage_path));

  const grouped = useMemo(() => {
    if (!bundle) return [] as Array<{ week: number; items: TreatmentMediaRow[] }>;
    const map = new Map<number, TreatmentMediaRow[]>();
    for (const p of photos) {
      const w = weekOf(bundle.plan.start_date, p);
      map.set(w, [...(map.get(w) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([week, items]) => ({ week, items }));
  }, [photos, bundle]);

  if (loading || mediaLoading) {
    return (
      <ScreenLayout>
        <TitleBar title="Progress" backFallback="/home" />
        <LoadingDot />
      </ScreenLayout>
    );
  }

  if (!bundle) {
    return (
      <ScreenLayout>
        <TitleBar title="Progress" backFallback="/home" />
        <div className="px-5 pt-4">
          <EmptyState icon="🌱" message="We couldn't find that plan." />
        </div>
      </ScreenLayout>
    );
  }

  const { plan, schedule, entries, milestones } = bundle;
  const weeks = weekBreakdown(
    schedule,
    entries,
    plan.start_date,
    plan.duration_weeks,
    milestones.map((m) => m.week_number),
  );
  const maxBar = Math.max(1, ...weeks.map((w) => Math.max(w.expected, w.expectedFull)));

  const toggleCompare = (path: string) =>
    setCompare((c) =>
      c.includes(path) ? c.filter((p) => p !== path) : [...c.slice(-1), path],
    );

  const comparePair = compare.filter((p) => urls[p]);

  return (
    <ScreenLayout>
      <TitleBar title="Progress" backFallback={`/treatment/${plan.id}`} />

      <div className="px-5 pt-1 pb-10 space-y-5">
        <div>
          <h1 className="font-display text-[24px] leading-tight break-words">{plan.title}</h1>
          <p className="font-body text-[13px] text-muted-foreground mt-1">
            Oldest first, so you can see the sequence.
          </p>
        </div>

        {/* adherence by week */}
        <div>
          <SectionLabel className="px-0 mt-0 mb-2">Week by week</SectionLabel>
          <SurfaceCard className="space-y-2">
            <div className="flex items-end gap-1.5 h-24">
              {weeks.map((w) => {
                const future = w.state === "future";
                const height = future
                  ? 0
                  : Math.round((w.completed / maxBar) * 100);
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={cn(
                          "w-full rounded-t-[4px]",
                          future ? "bg-muted/60" : "bg-primary/70",
                        )}
                        style={{ height: future ? "6px" : `${Math.max(6, height)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "font-body text-[9px]",
                        w.state === "current" ? "text-primary font-semibold" : "text-muted-foreground",
                        future && "opacity-60",
                      )}
                    >
                      {w.week}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1 pt-1">
              {weeks
                .filter((w) => w.state !== "future")
                .slice()
                .reverse()
                .map((w) => (
                  <div key={w.week} className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "font-body text-[12px]",
                        w.state === "current" ? "text-primary font-semibold" : "text-foreground/80",
                      )}
                    >
                      Week {w.week}
                      {w.state === "current" ? " · this week" : ""}
                    </span>
                    <span className="font-body text-[12px] text-muted-foreground">{w.line}</span>
                  </div>
                ))}
            </div>
            <p className="font-body text-[12px] text-muted-foreground leading-snug">
              Each bar is what you logged that week. Weeks ahead of you are left empty — they're not
              counted.
            </p>
          </SurfaceCard>

        </div>

        {/* photo timeline */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <SectionLabel className="px-0 mt-0 mb-0">Photos</SectionLabel>
            {photos.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setComparing((v) => !v);
                  setCompare([]);
                }}
                className="font-body text-[12px] text-primary"
              >
                {comparing ? "Done" : "Compare two"}
              </button>
            )}
          </div>

          {photos.length === 0 ? (
            <SurfaceCard>
              <p className="font-body text-[13px] text-muted-foreground leading-snug">
                Photos you add at a check-in will line up here, week by week.
              </p>
            </SurfaceCard>
          ) : (
            <div className="space-y-3">
              {comparing && (
                <p className="font-body text-[12px] text-muted-foreground">
                  Pick two photos to see them side by side.
                </p>
              )}
              {grouped.map((g) => (
                <div key={g.week} className="space-y-1.5">
                  <p className="font-body text-[12px] text-muted-foreground">
                    Week {g.week} · {format(fromDateKey(toDateKey(new Date(g.items[0].captured_at))), "d MMM")}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {g.items.map((p) => {
                      const selected = compare.includes(p.storage_path);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => comparing && toggleCompare(p.storage_path)}
                          className={cn(
                            "relative aspect-square rounded-[10px] overflow-hidden bg-muted",
                            comparing && "ring-offset-2",
                            selected && "ring-2 ring-primary",
                          )}
                        >
                          {urls[p.storage_path] ? (
                            <img
                              src={urls[p.storage_path]}
                              alt={`Week ${g.week} progress photo`}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="size-full flex items-center justify-center">
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* compare view */}
        {comparing && comparePair.length === 2 && (
          <SurfaceCard className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-body text-[13px] font-semibold">Side by side</p>
              <button
                type="button"
                aria-label="Clear comparison"
                onClick={() => setCompare([])}
                className="size-7 rounded-full border border-border flex items-center justify-center"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {comparePair.map((path) => {
                const row = photos.find((p) => p.storage_path === path)!;
                return (
                  <div key={path} className="space-y-1">
                    <img
                      src={urls[path]}
                      alt="Comparison photo"
                      className="w-full aspect-[3/4] object-cover rounded-[10px] bg-muted"
                    />
                    <p className="font-body text-[11px] text-muted-foreground text-center">
                      Week {weekOf(plan.start_date, row)}
                    </p>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        )}

        {/* voice playlist */}
        <div>
          <SectionLabel className="px-0 mt-0 mb-2">Voice notes</SectionLabel>
          {voice.length === 0 ? (
            <SurfaceCard>
              <p className="font-body text-[13px] text-muted-foreground leading-snug">
                Your recordings will sit here in order, so you can hear how things have shifted.
              </p>
            </SurfaceCard>
          ) : (
            <div className="space-y-1.5">
              {voice.map((n) => (
                <SurfaceCard key={n.id} padded={false} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-body text-[12px] text-muted-foreground">
                      Week {weekOf(plan.start_date, n)} ·{" "}
                      {format(new Date(n.captured_at), "d MMM")}
                    </p>
                    {n.duration_seconds != null && (
                      <span className="font-body text-[12px] text-muted-foreground tabular-nums">
                        {formatClock(Number(n.duration_seconds))}
                      </span>
                    )}
                  </div>
                  {urls[n.storage_path] ? (
                    <audio src={urls[n.storage_path]} controls preload="none" className="w-full h-8" />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="outline"
          className="rounded-pill w-full"
          onClick={() => navigate(`/treatment/${plan.id}`)}
        >
          Back to the plan
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default TreatmentProgress;
