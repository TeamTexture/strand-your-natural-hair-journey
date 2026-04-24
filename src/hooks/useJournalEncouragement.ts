// Powers the warm "encouragement" banner shown at the top of the Hair Journal.
//
// PRINCIPLE: every word is AI-generated against REAL user data, never hardcoded.
// We compute live signals from Supabase (saved journal entries, wash days,
// active goals, last wash, last appointment) and ship them to the
// `journal-encouragement` edge function which writes the copy via Lovable AI.
//
// Caching: the AI response is cached in localStorage for 6h keyed by user +
// signal-signature. As soon as the underlying numbers change (new wash, new
// entry, new goal progress), the signature changes and a fresh banner is
// generated. There is NO hardcoded fallback copy — if the AI is unreachable we
// surface a neutral one-liner derived directly from the live counts so the UI
// still reads as data-aware.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface JournalSignals {
  daysSinceSignup: number;
  /** Real saved journal entries (DB), not the seeded mock catalogue. */
  entryCount: number;
  /** Days since the most recent saved entry (any source). null = none yet. */
  daysSinceLastEntry: number | null;
  /** Number of logged wash days. */
  washCount: number;
  /** Days since most recent wash day. null = none yet. */
  daysSinceLastWash: number | null;
  /** Active (non-complete) goals the user is tracking. */
  activeGoalCount: number;
  /** Title of the most recently updated goal, used for personal references. */
  recentGoalTitle: string | null;
  /** Days since the most recent goal update. */
  daysSinceGoalUpdate: number | null;
  /** Days since the most recent logged appointment. */
  daysSinceLastAppointment: number | null;
  /** Lifecycle bucket the AI uses to set tone. Derived, never hardcoded copy. */
  lifecycleStage:
    | "brand_new"
    | "first_week"
    | "first_month"
    | "settling_in"
    | "established"
    | "long_term";
  /** Engagement state derived purely from live activity. */
  engagementState:
    | "no_data"
    | "active_streak"
    | "consistent"
    | "slowing_down"
    | "comeback"
    | "dormant";
  /** A short label shown above the banner (e.g. "Day 12 · 3 entries"). */
  milestoneLabel: string;
}

export interface EncouragementBanner {
  headline: string;
  subline: string;
}

const CACHE_PREFIX = "strand_journal_banner_v2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface CacheEntry {
  banner: EncouragementBanner;
  ts: number;
  signature: string;
}

const daysBetween = (iso: string | null | undefined, now = Date.now()): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
};

const deriveLifecycle = (days: number): JournalSignals["lifecycleStage"] => {
  if (days <= 1) return "brand_new";
  if (days < 7) return "first_week";
  if (days < 30) return "first_month";
  if (days < 90) return "settling_in";
  if (days < 365) return "established";
  return "long_term";
};

const deriveEngagement = (
  entryCount: number,
  daysSinceLastEntry: number | null,
  daysSinceLastWash: number | null,
): JournalSignals["engagementState"] => {
  const recentActivityDays = Math.min(
    daysSinceLastEntry ?? Infinity,
    daysSinceLastWash ?? Infinity,
  );
  if (entryCount === 0 && daysSinceLastWash === null) return "no_data";
  if (recentActivityDays <= 3 && entryCount + (daysSinceLastWash != null ? 1 : 0) >= 3) {
    return "active_streak";
  }
  if (recentActivityDays <= 10) return "consistent";
  if (recentActivityDays <= 30) return "slowing_down";
  if (recentActivityDays <= 90) return "comeback";
  return "dormant";
};

const buildLabel = (s: Omit<JournalSignals, "milestoneLabel">): string => {
  const parts: string[] = [];
  parts.push(`Day ${s.daysSinceSignup}`);
  if (s.entryCount > 0) parts.push(`${s.entryCount} ${s.entryCount === 1 ? "entry" : "entries"}`);
  if (s.washCount > 0) parts.push(`${s.washCount} wash${s.washCount === 1 ? "" : "es"}`);
  return parts.join(" · ");
};

const neutralBannerFromSignals = (s: JournalSignals): EncouragementBanner => {
  // Used only if AI is unavailable. Reads live numbers — never invented copy.
  if (s.entryCount === 0 && s.washCount === 0) {
    return {
      headline: "Your journal is empty",
      subline: `Day ${s.daysSinceSignup} with STRAND. Log your first entry to start building patterns.`,
    };
  }
  const recent = Math.min(
    s.daysSinceLastEntry ?? Infinity,
    s.daysSinceLastWash ?? Infinity,
  );
  if (recent === Infinity) {
    return {
      headline: "Pick up where you left off",
      subline: `${s.entryCount} entries and ${s.washCount} washes logged so far.`,
    };
  }
  return {
    headline: `${s.entryCount + s.washCount} logs and counting`,
    subline: `Last activity ${recent} day${recent === 1 ? "" : "s"} ago. Keep the record going.`,
  };
};

export const useJournalEncouragement = () => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<JournalSignals | null>(null);
  const [banner, setBanner] = useState<EncouragementBanner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSignals(null);
      setBanner(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // --- Pull real-time data in parallel ---------------------------------
      const [entryRes, washRes, goalRes, apptRes] = await Promise.all([
        supabase
          .from("journal_entries")
          .select("entry_date, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("wash_days")
          .select("wash_date, created_at")
          .eq("user_id", user.id)
          .order("wash_date", { ascending: false }),
        supabase
          .from("user_goals")
          .select("title, status, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("appointments")
          .select("appointment_date")
          .eq("user_id", user.id)
          .order("appointment_date", { ascending: false })
          .limit(1),
      ]);

      if (cancelled) return;

      const now = Date.now();
      const createdAt = user.created_at ?? new Date().toISOString();
      const daysSinceSignup = daysBetween(createdAt, now) ?? 0;

      const entries = entryRes.data ?? [];
      const washes = washRes.data ?? [];
      const goalsRows = goalRes.data ?? [];
      const appts = apptRes.data ?? [];

      const lastEntryIso =
        entries[0]?.created_at ?? entries[0]?.entry_date ?? null;
      const lastWashIso = washes[0]?.wash_date ?? washes[0]?.created_at ?? null;
      const activeGoals = goalsRows.filter((g) => g.status !== "complete");
      const recentGoal = goalsRows[0] ?? null;

      const partial = {
        daysSinceSignup,
        entryCount: entries.length,
        daysSinceLastEntry: daysBetween(lastEntryIso, now),
        washCount: washes.length,
        daysSinceLastWash: daysBetween(lastWashIso, now),
        activeGoalCount: activeGoals.length,
        recentGoalTitle: recentGoal?.title ?? null,
        daysSinceGoalUpdate: daysBetween(recentGoal?.updated_at ?? null, now),
        daysSinceLastAppointment: daysBetween(
          appts[0]?.appointment_date ?? null,
          now,
        ),
        lifecycleStage: deriveLifecycle(daysSinceSignup),
        engagementState: deriveEngagement(
          entries.length,
          daysBetween(lastEntryIso, now),
          daysBetween(lastWashIso, now),
        ),
      } satisfies Omit<JournalSignals, "milestoneLabel">;

      const next: JournalSignals = {
        ...partial,
        milestoneLabel: buildLabel(partial),
      };

      setSignals(next);

      // --- Cache lookup keyed by signal signature --------------------------
      const signature = JSON.stringify({
        s: next.daysSinceSignup,
        e: next.entryCount,
        le: next.daysSinceLastEntry,
        w: next.washCount,
        lw: next.daysSinceLastWash,
        g: next.activeGoalCount,
        gu: next.daysSinceGoalUpdate,
        ls: next.lifecycleStage,
        es: next.engagementState,
      });
      const cacheKey = `${CACHE_PREFIX}:${user.id}`;
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry;
          if (
            parsed.signature === signature &&
            now - parsed.ts < CACHE_TTL_MS &&
            parsed.banner?.headline
          ) {
            setBanner(parsed.banner);
            setLoading(false);
            return;
          }
        }
      } catch {
        /* ignore cache parse errors */
      }

      // --- Ask the AI for fresh copy ---------------------------------------
      try {
        const { data, error } = await supabase.functions.invoke(
          "journal-encouragement",
          { body: next },
        );
        if (cancelled) return;
        if (error || !data?.banner?.headline) {
          setBanner(neutralBannerFromSignals(next));
        } else {
          setBanner(data.banner);
          try {
            const entry: CacheEntry = {
              banner: data.banner,
              ts: now,
              signature,
            };
            localStorage.setItem(cacheKey, JSON.stringify(entry));
          } catch {
            /* quota — ignore */
          }
        }
      } catch {
        if (!cancelled) setBanner(neutralBannerFromSignals(next));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.created_at]);

  return { signals, banner, loading };
};
