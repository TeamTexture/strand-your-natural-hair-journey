import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { weekRange } from "@/lib/treatmentSchedule";
import { type CheckinRatings } from "@/lib/treatmentCheckin";
import { type TreatmentMediaRow } from "@/lib/treatmentMedia";

/**
 * Weekly check-ins and their media. Week numbering and week date ranges come
 * from src/lib/treatmentSchedule.ts — nothing here recomputes a date.
 */

export interface CheckinRow {
  id: string;
  plan_id: string;
  user_id: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  ratings: CheckinRatings;
  written_note: string | null;
  submitted_at: string | null;
  created_at: string;
}

const db = supabase as unknown as { from: (t: string) => any };

export function useTreatmentCheckins(planId?: string) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-checkins", user?.id, planId],
    enabled: !!user?.id && !!planId,
    staleTime: 30_000,
    queryFn: async () => {
      const [checkins, media] = await Promise.all([
        db.from("treatment_plan_checkins").select("*").eq("plan_id", planId).order("week_number"),
        db
          .from("treatment_plan_media")
          .select("*")
          .eq("plan_id", planId)
          .order("captured_at", { ascending: true }),
      ]);
      if (checkins.error) throw checkins.error;
      if (media.error) throw media.error;
      return {
        checkins: (checkins.data ?? []) as CheckinRow[],
        media: (media.data ?? []) as TreatmentMediaRow[],
      };
    },
  });

  return {
    checkins: q.data?.checkins ?? [],
    media: q.data?.media ?? [],
    loading: q.isLoading,
    refetch: q.refetch,
  };
}

/** Media belonging to one check-in, split by type. */
export function useCheckinMedia(media: TreatmentMediaRow[], checkinId?: string | null) {
  return useMemo(() => {
    const mine = media.filter((m) => m.checkin_id && m.checkin_id === checkinId);
    return {
      photos: mine.filter((m) => m.media_type === "photo"),
      audio: mine.filter((m) => m.media_type === "audio"),
      video: mine.find((m) => m.media_type === "video") ?? null,
    };
  }, [media, checkinId]);
}

export function useCheckinMutations(planId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["treatment-checkins", user?.id, planId] });
    void qc.invalidateQueries({ queryKey: ["treatment-plans", user?.id] });
  }, [qc, user?.id, planId]);

  /**
   * Opens (or reuses) the check-in row for a week so media has something to
   * hang off while the member is still filling it in. Left unsubmitted until
   * they save.
   */
  const ensureCheckin = useMutation({
    mutationFn: async (v: { week: number; startDate: string }): Promise<CheckinRow> => {
      const existing = await db
        .from("treatment_plan_checkins")
        .select("*")
        .eq("plan_id", planId)
        .eq("week_number", v.week)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return existing.data as CheckinRow;

      const { start, end } = weekRange(v.startDate, v.week);
      const { data, error } = await db
        .from("treatment_plan_checkins")
        .insert({
          plan_id: planId,
          user_id: user!.id,
          week_number: v.week,
          week_start_date: start,
          week_end_date: end,
          ratings: {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as CheckinRow;
    },
    onSuccess: invalidate,
  });

  /** Save — writes the ratings JSONB, the note, and marks the week complete. */
  const saveCheckin = useMutation({
    mutationFn: async (v: { checkinId: string; ratings: CheckinRatings; note: string }) => {
      const { error } = await db
        .from("treatment_plan_checkins")
        .update({
          ratings: v.ratings,
          written_note: v.note.trim() || null,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", v.checkinId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Links a milestone to the photo that answered it. */
  const completeMilestone = useMutation({
    mutationFn: async (v: { milestoneId: string; mediaId: string }) => {
      const { error } = await db
        .from("treatment_plan_milestones")
        .update({ media_id: v.mediaId, completed_at: new Date().toISOString() })
        .eq("id", v.milestoneId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Clears a milestone when its photo is removed. */
  const clearMilestone = useMutation({
    mutationFn: async (v: { milestoneId: string }) => {
      const { error } = await db
        .from("treatment_plan_milestones")
        .update({ media_id: null, completed_at: null })
        .eq("id", v.milestoneId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ensureCheckin, saveCheckin, completeMilestone, clearMilestone, invalidate };
}
