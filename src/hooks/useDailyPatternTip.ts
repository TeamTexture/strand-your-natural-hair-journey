// LAYER 2 CLIENT — "YOUR WEEK", ONE AI CALL PER WEEK.
//
// The card never regenerates on a view. The edge function holds the
// authoritative weekly signature (read from the database), so this hook can be
// mounted freely: a repeat visit returns the stored card. The deterministic
// week summary is computed here and sent as finished arithmetic.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDailyHairEntries } from "@/hooks/useDailyHairEntries";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { buildAiContext } from "@/lib/aiContext";
import { buildDailyWeekSummary, weekSignatureParts } from "@/lib/dailyWeekSummary";
import { aiRetryDelay, retryTransportOnce } from "@/lib/aiRetry";
import { hashString } from "@/lib/tipSignature";

export interface DailyPatternTip {
  headline?: string;
  pattern?: string;
  next_step?: string;
}

const hasSubstance = (t: DailyPatternTip | null | undefined) =>
  !!t && !!(t.headline ?? "").trim() && !!(t.pattern ?? "").trim() && !!(t.next_step ?? "").trim();

export function useDailyPatternTip() {
  const { user } = useAuth();
  const { entries, isLoading: entriesLoading } = useDailyHairEntries();
  const { products } = useUserProducts("all");
  const { last } = useWashDays({ static: true });
  // Level is a rendering variant — resolve it before any keyed lookup.
  const { level, ready: levelReady } = useTipsLevel();

  const summary = useMemo(
    () => buildDailyWeekSummary(entries, products, last?.wash_date ?? null),
    [entries, products, last?.wash_date],
  );

  const signature = useMemo(
    () => (summary ? hashString(["daily-week-v1", ...weekSignatureParts(summary)].join("::")) : null),
    [summary],
  );

  const query = useQuery({
    queryKey: ["daily-pattern-tip", user?.id, signature, level],
    enabled: !!user && levelReady && !!summary && !entriesLoading,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 36,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: retryTransportOnce,
    retryDelay: aiRetryDelay,
    queryFn: async (): Promise<DailyPatternTip | null> => {
      if (!summary) return null;
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("daily-pattern-tip", {
        body: { week: summary, context: { ...context, tipsLevel: level } },
      });
      if (error) throw error;
      const tip = (data?.tip as DailyPatternTip) ?? null;
      return hasSubstance(tip) ? tip : null;
    },
  });

  return { ...query, summary, tip: hasSubstance(query.data) ? query.data! : null };
}
