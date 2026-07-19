// AI Analysis on changes since last test — replaces the raw "Movement" list
// with a holistic, aesthetic breakdown that folds hair characteristics, goals
// and health context into the read. Only calls the edge function when both
// latest and previous panel ids exist; falls back gracefully otherwise.

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Droplets,
  Flame,
  Leaf,
  Zap,
  ShieldAlert,
  Activity,
  Sparkles,
  Brain,
  Utensils,
  HeartPulse,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  Loader2,
} from "lucide-react";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import { cn } from "@/lib/utils";

interface Delta {
  marker: string;
  unit: string | null;
  previous: number | null;
  current: number | null;
  previous_status: string | null;
  current_status: string | null;
}

interface LatestResult {
  marker: string;
  value: number | null;
  unit: string | null;
  status: string | null;
  category: string | null;
}

interface Panel {
  id: string;
  date: string | null;
  label?: string | null;
  lab_name?: string | null;
  test_type?: string | null;
}

interface Analysis {
  headline: string;
  overall: string;
  confidence: "low" | "medium" | "high";
  key_changes: Array<{
    marker: string;
    direction: "up" | "down" | "flat";
    from: number;
    to: number;
    unit: string;
    insight: string;
    tone: "good" | "warn" | "neutral";
  }>;
  focus_areas: Array<{
    icon:
      | "iron"
      | "thyroid"
      | "vitamin"
      | "protein"
      | "hydration"
      | "scalp"
      | "stress"
      | "hormone"
      | "inflammation"
      | "nutrition";
    title: string;
    body: string;
    action?: string;
  }>;
}

const ICONS: Record<Analysis["focus_areas"][number]["icon"], typeof Droplets> = {
  iron: Flame,
  thyroid: Activity,
  vitamin: Sparkles,
  protein: Leaf,
  hydration: Droplets,
  scalp: Zap,
  stress: Brain,
  hormone: HeartPulse,
  inflammation: ShieldAlert,
  nutrition: Utensils,
};

const ICON_TINTS: Record<Analysis["focus_areas"][number]["icon"], string> = {
  iron: "bg-warn/15 text-warn",
  thyroid: "bg-primary/15 text-primary",
  vitamin: "bg-primary/15 text-primary",
  protein: "bg-good/15 text-good",
  hydration: "bg-primary/15 text-primary",
  scalp: "bg-warn/15 text-warn",
  stress: "bg-alert-dark/15 text-alert-dark",
  hormone: "bg-primary/15 text-primary",
  inflammation: "bg-alert-dark/15 text-alert-dark",
  nutrition: "bg-good/15 text-good",
};

interface Props {
  latestPanel: Panel;
  previousPanel: Panel | null;
  deltas: Delta[];
  latestResults: LatestResult[];
}

export default function BloodChangeAnalysis({
  latestPanel,
  previousPanel,
  deltas,
  latestResults,
}: Props) {
  const cacheKey = useMemo(
    () => [
      "blood-change-analysis",
      latestPanel.id,
      previousPanel?.id ?? "none",
      latestResults.length,
    ],
    [latestPanel.id, previousPanel?.id, latestResults.length],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: cacheKey,
    // Only run when we actually have data worth analysing.
    enabled: latestResults.length > 0,
    staleTime: 1000 * 60 * 60 * 24, // 1 day
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
    queryFn: async (): Promise<Analysis | null> => {
      const context = await buildAiContext().catch(() => ({}));
      const { data: resp, error } = await supabase.functions.invoke(
        "blood-change-analysis",
        {
          body: {
            latestPanel,
            previousPanel,
            deltas,
            latestResults,
            context,
          },
        },
      );
      if (error) throw error;
      return (resp as { analysis?: Analysis })?.analysis ?? null;
    },
  });

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <SectionLabel>AI analysis — changes since last test</SectionLabel>
        {data && !isFetching && (
          <button
            onClick={() => refetch()}
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-primary flex items-center gap-1"
            aria-label="Regenerate analysis"
          >
            <RefreshCw className="size-3" />
            Refresh
          </button>
        )}
      </div>

      <SurfaceCard padded={false}>
        {isLoading || isFetching ? (
          <div className="p-6 flex items-center gap-3 text-sm text-muted-foreground font-body">
            <Loader2 className="size-4 animate-spin" />
            Analysing your data holistically…
          </div>
        ) : isError || !data ? (
          <div className="p-4 space-y-2">
            <p className="text-sm font-body text-muted-foreground">
              Couldn't generate a fresh analysis just yet.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {/* Headline + overall */}
            <div className="p-4 space-y-2 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-t-[14px]">
              <div className="flex items-start gap-2.5">
                <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-[17px] leading-snug text-foreground">
                    {data.headline}
                  </p>
                  <p className="text-sm text-foreground/80 font-body leading-relaxed mt-1.5">
                    {data.overall}
                  </p>
                </div>
              </div>
            </div>

            {/* Key changes */}
            {data.key_changes.length > 0 && (
              <div className="p-4 space-y-2.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-body">
                  Key movements
                </p>
                <ul className="space-y-2">
                  {data.key_changes.map((c) => {
                    const Icon =
                      c.direction === "flat"
                        ? Minus
                        : c.direction === "up"
                          ? ArrowUpRight
                          : ArrowDownRight;
                    const tone =
                      c.tone === "good"
                        ? "text-good"
                        : c.tone === "warn"
                          ? "text-warn"
                          : "text-foreground/70";
                    const chipBg =
                      c.tone === "good"
                        ? "bg-good/10"
                        : c.tone === "warn"
                          ? "bg-warn/10"
                          : "bg-muted";
                    return (
                      <li
                        key={c.marker}
                        className="flex items-start gap-3 rounded-[12px] bg-muted/40 p-3"
                      >
                        <div
                          className={cn(
                            "size-7 rounded-full flex items-center justify-center shrink-0",
                            chipBg,
                            tone,
                          )}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-body font-medium">
                            {c.marker}
                            <span className={cn("ml-2 text-xs font-normal", tone)}>
                              {c.from} → {c.to} {c.unit}
                            </span>
                          </p>
                          <p className="text-xs text-foreground/75 font-body leading-relaxed mt-0.5">
                            {c.insight}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Focus areas */}
            {data.focus_areas.length > 0 && (
              <div className="p-4 space-y-2.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-body">
                  Where to focus
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {data.focus_areas.map((f, i) => {
                    const Icon = ICONS[f.icon] ?? Sparkles;
                    return (
                      <div
                        key={`${f.icon}-${i}`}
                        className="rounded-[12px] border border-border/60 bg-card p-3 flex items-start gap-3"
                      >
                        <div
                          className={cn(
                            "size-9 rounded-[10px] flex items-center justify-center shrink-0",
                            ICON_TINTS[f.icon] ?? "bg-primary/15 text-primary",
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-body font-semibold">
                            {f.title}
                          </p>
                          <p className="text-xs text-foreground/75 font-body leading-relaxed mt-0.5">
                            {f.body}
                          </p>
                          {f.action && (
                            <p className="text-xs font-body text-primary mt-1.5">
                              → {f.action}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="px-4 py-2.5 bg-muted/30 rounded-b-[14px]">
              <p className="text-[10px] font-body text-muted-foreground">
                Holistic read — weighs hair profile, goals and your recent health data. Not medical advice.
              </p>
            </div>
          </div>
        )}
      </SurfaceCard>
    </>
  );
}
