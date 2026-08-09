// AI Analysis on changes since last test — replaces the raw "Movement" list
// with a holistic, aesthetic breakdown that folds hair characteristics, goals
// and health context into the read. Only calls the edge function when both
// latest and previous panel ids exist; falls back gracefully otherwise.

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Loader2 } from "lucide-react";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import ActionList from "@/components/guidance/ActionList";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";

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
  confidence: "low" | "medium" | "high";
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

interface Props {
  latestPanel: Panel;
  previousPanel: Panel | null;
  deltas: Delta[];
  latestResults: LatestResult[];
}

function ActionLink({ action, icon }: { action: string; icon: string }) {
  const navigate = useNavigate();
  const isDiet =
    icon === "nutrition" ||
    /diet|nutrition|supplement|eat|food/i.test(action);
  if (!isDiet) {
    return (
      <p className="text-xs font-body text-primary mt-1.5">→ {action}</p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => navigate("/nutrition-plan")}
      className="mt-1.5 inline-flex items-center gap-1 text-xs font-body text-primary underline underline-offset-2"
    >
      → {action}
    </button>
  );
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
      "v3-manuscript-2026-08-09",
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
            {/* Where to focus — the only content on this card */}
            {data.focus_areas.length > 0 && (
              <div className="p-4 space-y-2.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-body">
                  Where to focus
                </p>
                <ActionList
                  idPrefix="focus"
                  actions={data.focus_areas.slice(0, 3).map((f) => ({
                    action: f.title,
                    why: f.body,
                  }))}
                  showWhy
                />
                <div className="space-y-1">
                  {data.focus_areas
                    .slice(0, 3)
                    .filter((f) => f.action)
                    .map((f, i) => (
                      <ActionLink key={`${f.icon}-${i}`} action={f.action as string} icon={f.icon} />
                    ))}
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
