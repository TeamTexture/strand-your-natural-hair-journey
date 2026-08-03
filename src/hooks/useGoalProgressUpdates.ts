import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GoalProgressUpdate {
  id: string;
  goal_id: string;
  user_id: string;
  body_text: string | null;
  audio_path: string | null;
  transcription_text: string | null;
  photo_entry_ref: string | null;
  created_at: string;
}

export const GOAL_AUDIO_BUCKET = "goal-progress-audio";

export interface GoalProgressDraft {
  goalId: string;
  bodyText?: string | null;
  audioPath?: string | null;
  transcriptionText?: string | null;
  photoEntryRef?: string | null;
}

/**
 * Progress updates for one goal (or all of the user's goals when no id is
 * given). Nothing here is ever overwritten — each update is its own row so
 * a past goal keeps its full timeline.
 */
export const useGoalProgressUpdates = (goalId?: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["goal_progress_updates", user?.id ?? "anon", goalId ?? "all"];

  const { data: updates = [], isLoading: loading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as GoalProgressUpdate[];
      let q = supabase
        .from("goal_progress_updates")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (goalId) q = q.eq("goal_id", goalId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as GoalProgressUpdate[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (draft: GoalProgressDraft) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("goal_progress_updates")
        .insert({
          goal_id: draft.goalId,
          user_id: user.id,
          body_text: draft.bodyText?.trim() || null,
          audio_path: draft.audioPath ?? null,
          transcription_text: draft.transcriptionText?.trim() || null,
          photo_entry_ref: draft.photoEntryRef ?? null,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data as unknown as GoalProgressUpdate | null;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goal_progress_updates"] });
    },
  });

  const addUpdate = useCallback(
    (draft: GoalProgressDraft) => addMutation.mutateAsync(draft),
    [addMutation],
  );

  return { updates, latest: updates[0] ?? null, loading, addUpdate, saving: addMutation.isPending };
};

/** Short-lived signed URL for a private goal voicenote. */
export const signGoalAudio = async (path: string): Promise<string | null> => {
  const { data } = await supabase.storage.from(GOAL_AUDIO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
};
