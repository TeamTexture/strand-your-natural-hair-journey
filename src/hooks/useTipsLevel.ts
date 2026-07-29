import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_TIPS_LEVEL,
  TIPS_LEVEL_PROMPTED_KEY,
  TIPS_LEVEL_STORAGE_KEY,
  isTipsLevel,
  type TipsLevel,
} from "@/lib/tipsLevel";

/** Cross-component sync so every tips surface updates the moment the
 *  preference changes, without a page refresh. */
const listeners = new Set<(level: TipsLevel) => void>();
const promptListeners = new Set<(dismissed: boolean) => void>();

const readCached = (): TipsLevel => {
  try {
    const raw = localStorage.getItem(TIPS_LEVEL_STORAGE_KEY);
    return isTipsLevel(raw) ? raw : DEFAULT_TIPS_LEVEL;
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

/**
 * Tips density preference (`profiles.tips_level`).
 *
 * Returns the current level, a setter that persists to the backend, and
 * `needsPrompt` — true until the user has answered the one-time inline
 * "essentials or full guidance?" question.
 */
export function useTipsLevel() {
  const { user } = useAuth();
  const [level, setLevelState] = useState<TipsLevel>(readCached);
  const [prompted, setPrompted] = useState<boolean>(readPrompted);

  useEffect(() => {
    const onLevel = (l: TipsLevel) => setLevelState(l);
    const onPrompt = (d: boolean) => setPrompted(d);
    listeners.add(onLevel);
    promptListeners.add(onPrompt);
    return () => {
      listeners.delete(onLevel);
      promptListeners.delete(onPrompt);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tips_level, tips_level_prompted_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const next = isTipsLevel(data.tips_level) ? data.tips_level : DEFAULT_TIPS_LEVEL;
      setLevelState(next);
      try {
        localStorage.setItem(TIPS_LEVEL_STORAGE_KEY, next);
      } catch { /* private mode */ }
      if (data.tips_level_prompted_at) {
        setPrompted(true);
        try {
          localStorage.setItem(TIPS_LEVEL_PROMPTED_KEY, "1");
        } catch { /* private mode */ }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const persist = useCallback(
    async (next: TipsLevel, markPrompted: boolean) => {
      try {
        localStorage.setItem(TIPS_LEVEL_STORAGE_KEY, next);
        if (markPrompted) localStorage.setItem(TIPS_LEVEL_PROMPTED_KEY, "1");
      } catch { /* private mode */ }
      setLevelState(next);
      listeners.forEach((l) => l(next));
      if (markPrompted) {
        setPrompted(true);
        promptListeners.forEach((l) => l(true));
      }
      if (!user) return;
      await supabase
        .from("profiles")
        .update({
          tips_level: next,
          ...(markPrompted ? { tips_level_prompted_at: new Date().toISOString() } : {}),
        })
        .eq("id", user.id);
    },
    [user],
  );

  const setLevel = useCallback((next: TipsLevel) => { void persist(next, false); }, [persist]);
  const answerPrompt = useCallback((next: TipsLevel) => { void persist(next, true); }, [persist]);

  return { level, setLevel, answerPrompt, needsPrompt: !prompted };
}
