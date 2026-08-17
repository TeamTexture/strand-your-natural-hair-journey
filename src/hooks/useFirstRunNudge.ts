import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { myProfileKey, useMyProfile, type MyProfileRow } from "@/hooks/useMyProfile";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";

/**
 * FIRST-RUN NUDGE GATE — database-backed, never localStorage-decided.
 *
 * A first-run nudge (home tour, goals/challenges ask, hair length ask…) may
 * only show when ALL of these hold:
 *   • onboarding is complete
 *   • the member has consumer access (paid, complimentary, admin/pro)
 *   • the matching `profiles.*_seen_at` column is NULL
 *   • `onboarding_completed_at` is within the last 14 days
 *
 * localStorage is an optimistic cache only: it can suppress a flash before the
 * profile row loads, but a missing key never makes a nudge show when the
 * database column is set. The timestamp is written on FIRST DISPLAY, so an
 * ignored nudge never returns.
 */
export type NudgeColumn =
  | "home_tour_seen_at"
  | "goals_prompt_seen_at"
  | "hair_length_prompt_seen_at"
  | "pro_tour_seen_at";

const NEW_MEMBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const cacheKey = (column: NudgeColumn) => `strand.nudge.${column}`;

const readCache = (column: NudgeColumn): boolean => {
  try {
    return localStorage.getItem(cacheKey(column)) === "1";
  } catch {
    return false;
  }
};

const writeCache = (column: NudgeColumn) => {
  try {
    localStorage.setItem(cacheKey(column), "1");
  } catch {
    /* private mode */
  }
};

type ProfileWithNudges = MyProfileRow & Partial<Record<NudgeColumn, string | null>>;

export function useFirstRunNudge(column: NudgeColumn) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { hasAccess, isLoading: accessLoading } = useConsumerSubscription();
  const [seenLocally, setSeenLocally] = useState(() => readCache(column));
  const markedRef = useRef(false);

  const row = (profile ?? null) as ProfileWithNudges | null;
  const completedAt = row?.onboarding_completed_at ?? null;
  const withinWindow =
    !!completedAt && Date.now() - new Date(completedAt).getTime() < NEW_MEMBER_WINDOW_MS;
  const seenInDb = !!row?.[column];

  const eligible =
    !profileLoading &&
    !accessLoading &&
    !!row &&
    !!completedAt &&
    hasAccess &&
    withinWindow &&
    !seenInDb &&
    !seenLocally;

  // Keep the optimistic cache honest with the database.
  useEffect(() => {
    if (seenInDb && !seenLocally) {
      writeCache(column);
      setSeenLocally(true);
    }
  }, [seenInDb, seenLocally, column]);

  /** Record the nudge as seen — call this the moment it is displayed. */
  const markSeen = useCallback(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    writeCache(column);
    setSeenLocally(true);
    if (!user?.id) return;
    const now = new Date().toISOString();
    qc.setQueryData<MyProfileRow | null>(myProfileKey(user.id), (old) =>
      old ? ({ ...(old as ProfileWithNudges), [column]: now } as MyProfileRow) : old,
    );
    void supabase
      .from("profiles")
      .update({ [column]: now } as never)
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) console.warn(`[nudge] ${column} save failed`, error.message);
      });
  }, [column, qc, user?.id]);

  return { eligible, markSeen, loading: profileLoading || accessLoading };
}
