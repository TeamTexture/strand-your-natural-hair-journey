import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserChallenge {
  id: string;
  user_id: string;
  label: string;
  created_at?: string;
}

/**
 * Challenges are now their OWN thing, stored in `user_challenges` — completely
 * separate from goals. A member can have one goal (length retention) and
 * several unrelated challenges (shedding, dryness, time). Both feed AI
 * personalisation independently.
 */
export const useChallenges = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["user_challenges", user?.id ?? "anon"];

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as UserChallenge[];
      const { data, error } = await supabase
        .from("user_challenges")
        .select("id, user_id, label, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UserChallenge[];
    },
  });

  // Fallback: the challenges she picked during onboarding live on her
  // onboarding goal row (`user_goals.challenges`). Members who onboarded before
  // `user_challenges` existed — and anyone who has never opened the challenges
  // editor — must still see those answers pre-populated everywhere.
  const { data: onboardingLabels = [] } = useQuery({
    queryKey: ["user_challenges_onboarding", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as string[];
      const { data } = await supabase
        .from("user_goals")
        .select("challenges")
        .eq("user_id", user.id)
        .eq("kind", "onboarding")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const list = Array.isArray(data?.challenges) ? data!.challenges : [];
      return list
        .map((c) => String(c ?? "").trim())
        .filter((c): c is string => c.length > 0);
    },
  });

  const labels = useMemo(() => {
    const own = rows.map((r) => (r.label ?? "").trim()).filter(Boolean);
    return own.length > 0 ? own : onboardingLabels;
  }, [rows, onboardingLabels]);


  /** Replace the whole list — the editor sheet works on a chip array. */
  const saveMutation = useMutation({
    mutationFn: async (next: string[]) => {
      if (!user) return;
      const cleaned: string[] = [];
      const seen = new Set<string>();
      for (const raw of next) {
        const v = String(raw ?? "").trim().slice(0, 120);
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(v);
      }

      const existing = new Map(
        rows.map((r) => [(r.label ?? "").trim().toLowerCase(), r] as const),
      );
      const keep = new Set(cleaned.map((c) => c.toLowerCase()));

      const toDelete = rows
        .filter((r) => !keep.has((r.label ?? "").trim().toLowerCase()))
        .map((r) => r.id);
      const toInsert = cleaned
        .filter((c) => !existing.has(c.toLowerCase()))
        .map((label) => ({ user_id: user.id, label }));

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("user_challenges")
          .delete()
          .in("id", toDelete)
          .eq("user_id", user.id);
        if (error) throw error;
      }
      if (toInsert.length > 0) {
        const { error } = await supabase.from("user_challenges").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  return {
    challenges: labels,
    rows,
    loading,
    saveChallenges: (next: string[]) => saveMutation.mutateAsync(next),
    saving: saveMutation.isPending,
  };
};

export default useChallenges;
