import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { myProfileKey, useMyProfile, type MyProfileRow } from "@/hooks/useMyProfile";
import { invalidateAiContextCache } from "@/lib/aiContext";
import {
  DEFAULT_TIPS_LEVEL,
  TIPS_LEVEL_PROMPTED_KEY,
  TIPS_LEVEL_STORAGE_KEY,
  coerceTipsLevel,
  showsBeginnerHelp,
  showsExplanations,
  type TipsLevel,
} from "@/lib/tipsLevel";

interface TipsLevelContextValue {
  level: TipsLevel;
  setLevel: (next: TipsLevel) => void;
  answerPrompt: (next: TipsLevel) => void;
  needsPrompt: boolean;
  showExplanations: boolean;
  showBeginnerHelp: boolean;
  /**
   * True once `level` reflects the SERVER value (or there is no session, so no
   * server value is coming). Any surface that keys a cache — or an AI call — on
   * the level MUST wait for this: the initial render returns the locally cached
   * or default level, and acting on that fired a fresh analysis at the wrong
   * level on every page open before the real level arrived.
   */
  ready: boolean;
}

const TipsLevelContext = createContext<TipsLevelContextValue | null>(null);

const readCached = (): TipsLevel => {
  try {
    return coerceTipsLevel(localStorage.getItem(TIPS_LEVEL_STORAGE_KEY));
  } catch {
    return DEFAULT_TIPS_LEVEL;
  }
};

const readPrompted = (): boolean => {
  try {
    return localStorage.getItem(TIPS_LEVEL_PROMPTED_KEY) === "1";
  } catch {
    return false;
  }
};

export function TipsLevelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [level, setLevelState] = useState<TipsLevel>(readCached);
  const [prompted, setPrompted] = useState<boolean>(readPrompted);
  const queryClient = useQueryClient();
  const { data: profile, isFetched: profileFetched } = useMyProfile();
  const levelRef = useRef(level);
  const lastOptimisticAtRef = useRef(0);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    if (!profile || !user?.id) return;
    const next = coerceTipsLevel(profile.tips_level);
    const recentlyChanged = Date.now() - lastOptimisticAtRef.current < 3_000;
    if (recentlyChanged && next !== levelRef.current) return;
    setLevelState(next);
    levelRef.current = next;
    try {
      localStorage.setItem(TIPS_LEVEL_STORAGE_KEY, String(next));
    } catch { /* private mode */ }
    if (profile.tips_level_prompted_at) {
      setPrompted(true);
      try {
        localStorage.setItem(TIPS_LEVEL_PROMPTED_KEY, "1");
      } catch { /* private mode */ }
    }
  }, [profile, user?.id]);

  const persist = useCallback(
    async (next: TipsLevel, markPrompted: boolean) => {
      const safeNext = coerceTipsLevel(next);
      lastOptimisticAtRef.current = Date.now();
      try {
        localStorage.setItem(TIPS_LEVEL_STORAGE_KEY, String(safeNext));
        if (markPrompted) localStorage.setItem(TIPS_LEVEL_PROMPTED_KEY, "1");
      } catch { /* private mode */ }
      setLevelState(safeNext);
      levelRef.current = safeNext;
      invalidateAiContextCache();
      if (markPrompted) {
        setPrompted(true);
      }
      if (!user) return;
      queryClient.setQueryData<MyProfileRow | null>(myProfileKey(user.id), (old) => old ? {
        ...old,
        tips_level: safeNext,
        ...(markPrompted ? { tips_level_prompted_at: new Date().toISOString() } : {}),
      } : old);
      const { error } = await supabase
        .from("profiles")
        .update({
          tips_level: safeNext,
          ...(markPrompted ? { tips_level_prompted_at: new Date().toISOString() } : {}),
        })
        .eq("user_id", user.id);
      if (error) {
        console.warn("[tips level] save failed", error.message);
      }
      void queryClient.invalidateQueries({ queryKey: myProfileKey(user.id) });
    },
    [user, queryClient],
  );

  const setLevel = useCallback((next: TipsLevel) => { void persist(next, false); }, [persist]);
  const answerPrompt = useCallback((next: TipsLevel) => { void persist(next, true); }, [persist]);

  const value = useMemo<TipsLevelContextValue>(() => ({
    level,
    setLevel,
    answerPrompt,
    needsPrompt: !prompted,
    /** Show the EXTENDED "why" prose (level 3, Hand-holding, only). */
    showExplanations: showsExplanations(level),
    /** Show inline beginner definitions + encouragement (level 3, Hand-holding). */
    showBeginnerHelp: showsBeginnerHelp(level),
  }), [answerPrompt, level, prompted, setLevel]);

  return createElement(TipsLevelContext.Provider, { value }, children);
}

/**
 * Support-level preference (`profiles.tips_level`, 1–3).
 *
 * Returns the global current level, a setter that persists in the background,
 * and live booleans for density-aware rendering. This must be read by guidance
 * surfaces instead of querying `profiles.tips_level` directly.
 */
export function useTipsLevel() {
  const value = useContext(TipsLevelContext);
  if (value) return value;
  const fallbackLevel = readCached();
  return {
    level: fallbackLevel,
    setLevel: () => undefined,
    answerPrompt: () => undefined,
    needsPrompt: !readPrompted(),
    showExplanations: showsExplanations(fallbackLevel),
    showBeginnerHelp: showsBeginnerHelp(fallbackLevel),
  } satisfies TipsLevelContextValue;
}
