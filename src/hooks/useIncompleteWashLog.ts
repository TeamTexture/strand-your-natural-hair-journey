// An unfinished wash day log.
//
// The log flow autosaves every answer into the durable wash draft (local cache
// in front of `onboarding_drafts`), so a member who leaves the app mid-log
// keeps everything she had entered. This hook reads that draft back and
// summarises it so the Wash Day page can offer it as an "Incomplete" entry.
//
// IMPORTANT: an incomplete log is NEVER a `wash_days` row. Nothing else in the
// app (last wash day, rhythm/overdue maths, "since your last wash", tips,
// reviews) can therefore mistake it for a completed wash day.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  readWashDraft,
  clearWashDrafts,
  hydrateWashDrafts,
} from "@/lib/washDraft";
import { WASH_LOG_STEPS } from "@/lib/washLogSteps";
import { WASH_STEP_LABEL } from "@/lib/washSteps";

interface DraftRow {
  productId?: string | null;
  used?: boolean;
  skipped?: boolean;
}

export interface IncompleteWashLog {
  /** The date the log is for (YYYY-MM-DD). */
  date: string;
  /** Member-facing labels of the steps she has already answered. */
  filledSteps: string[];
  /** Steps she deliberately marked as skipped. */
  skippedSteps: string[];
  toolCount: number;
  /** True once she has reached the second screen and answered something there. */
  hasStyleAnswers: boolean;
}

export const incompleteWashLogKey = (userId?: string) => ["incomplete-wash-log", userId];

const summarise = (): IncompleteWashLog | null => {
  // Editing a saved wash day reuses the same draft keys — that is not an
  // unfinished new log and must never surface as one. The draft's own scope is
  // the authority on who it belongs to.
  const scope = readWashDraftScope();
  if (scope && scope !== "new") return null;
  const edit = readWashDraft<{ id?: string }>("strand_wash_log_edit", {});
  if (edit?.id) return null;


  const steps = readWashDraft<{
    date?: string;
    rows?: Record<string, DraftRow>;
    toolIds?: string[];
  }>("strand_wash_log_steps", {});
  const style = readWashDraft<{
    styleProductIds?: string[];
    note?: string;
    audioPath?: string | null;
    mediaPath?: string | null;
    rating?: number | null;
  }>("strand_wash_log_style", {});

  const rows = steps.rows ?? {};
  const filledSteps: string[] = [];
  const skippedSteps: string[] = [];
  for (const step of WASH_LOG_STEPS) {
    const row = rows[step.stored];
    if (!row) continue;
    if (row.productId) filledSteps.push(WASH_STEP_LABEL[step.stored] ?? step.label);
    else if (row.skipped) skippedSteps.push(WASH_STEP_LABEL[step.stored] ?? step.label);
  }
  const toolCount = (steps.toolIds ?? []).length;
  const hasStyleAnswers =
    (style.styleProductIds ?? []).length > 0 ||
    !!style.note?.trim() ||
    !!style.audioPath ||
    !!style.mediaPath ||
    typeof style.rating === "number";

  const anything =
    filledSteps.length > 0 || skippedSteps.length > 0 || toolCount > 0 || hasStyleAnswers;
  if (!anything) return null;

  const date = steps.date || readWashDraft<string>("strand_wash_date", "");
  if (!date) return null;

  return { date, filledSteps, skippedSteps, toolCount, hasStyleAnswers };
};

export function useIncompleteWashLog() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: incompleteWashLogKey(user?.id),
    enabled: !!user,
    staleTime: 0,
    queryFn: async (): Promise<IncompleteWashLog | null> => {
      // Pull the durable copy first so a log started on another device shows up.
      await hydrateWashDrafts();
      return summarise();
    },
  });

  const discard = useCallback(async () => {
    clearWashDrafts();
    await qc.invalidateQueries({ queryKey: incompleteWashLogKey(user?.id) });
  }, [qc, user?.id]);

  return { incomplete: query.data ?? null, loading: query.isLoading, discard };
}

export const summariseWashDraftForTest = summarise;
