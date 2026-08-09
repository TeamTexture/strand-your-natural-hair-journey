// Fills in the personalised STRAND match score for tools that don't have one.
//
// Products are scored by the ingredient analysis pipeline; tools have no label
// to scan, so a manually added tool used to render no stars at all. This hook
// finds the member's unscored tools, scores them in ONE batched AI call
// (`tool-match-score`) and persists the result onto `user_tools.match_score`
// (plus score_reasons inside ai_analysis) so the thumbnail, the detail view and
// any future surface all read the SAME number — the rule in src/lib/matchStars.
//
// Runs at most once per set of unscored tools per session; a score is written
// once and reused thereafter, so this costs one call the first time a tool is
// added and nothing afterwards.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { matchScoreOf } from "@/lib/matchStars";
import type { UserTool } from "@/hooks/useUserTools";

interface ScoredRow {
  id: string;
  match_score: number;
  score_reasons?: Array<{ direction: "plus" | "minus"; factor: string; reason: string }>;
}

export function useToolMatchScores(tools: UserTool[], onScored?: () => void) {
  const { user } = useAuth();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [scoring, setScoring] = useState(false);
  const [failed, setFailed] = useState(false);
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const pending = tools.filter(
      (t) => matchScoreOf(t) == null && !attempted.current.has(t.id),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    pending.forEach((t) => attempted.current.add(t.id));

    (async () => {
      setScoring(true);
      try {
        const context = await buildAiContext();
        const { data, error } = await supabase.functions.invoke("tool-match-score", {
          body: {
            tools: pending.slice(0, 12).map((t) => {
              const analysis = (t.ai_analysis ?? null) as Record<string, unknown> | null;
              const features = Array.isArray(analysis?.key_features)
                ? (analysis!.key_features as unknown[])
                    .map((f) =>
                      typeof f === "string"
                        ? f
                        : f && typeof f === "object" && typeof (f as { name?: unknown }).name === "string"
                          ? String((f as { name: string }).name)
                          : "",
                    )
                    .filter(Boolean)
                : [];
              const summary =
                typeof analysis?.ai_summary === "string"
                  ? (analysis.ai_summary as string)
                  : typeof analysis?.summary === "string"
                    ? (analysis.summary as string)
                    : null;
              return {
                id: t.id,
                name: t.name,
                brand: t.brand,
                category: t.category,
                notes: summary ?? t.notes,
                key_features: features,
              };
            }),
            context,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));
        const rows: ScoredRow[] = Array.isArray(data?.scores) ? data.scores : [];
        if (cancelled) return;
        if (rows.length === 0) {
          // The gateway declined (credit limit) — let the surfaces say so.
          setFailed(true);
          return;
        }
        setFailed(false);

        setScores((prev) => {
          const next = { ...prev };
          for (const r of rows) next[r.id] = r.match_score;
          return next;
        });

        // Persist so the score is stable across sessions and surfaces.
        await Promise.all(
          rows.map((r) => {
            const tool = pending.find((t) => t.id === r.id);
            const analysis = (tool?.ai_analysis ?? {}) as Record<string, unknown>;
            return supabase
              .from("user_tools")
              .update({
                match_score: r.match_score,
                ai_analysis: {
                  ...analysis,
                  match_score: r.match_score,
                  score_reasons: r.score_reasons ?? [],
                } as never,
              })
              .eq("id", r.id)
              .eq("user_id", user.id);
          }),
        );
        if (!cancelled) onScored?.();
      } catch (e) {
        console.warn("tool match scoring failed", e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setScoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tools.map((t) => `${t.id}:${matchScoreOf(t) ?? ""}`).join(",")]);

  return { scores, scoring, failed };
}
