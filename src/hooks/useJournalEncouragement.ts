import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { journalEntries } from "@/data/journalEntries";

export type Milestone =
  | "first_week"
  | "month_1"
  | "month_3"
  | "month_6"
  | "month_12"
  | "year_plus"
  | "first_entry_pending"
  | "streak"
  | "comeback"
  | "keep_going";

export interface JournalSignals {
  daysSinceSignup: number;
  entryCount: number;
  daysSinceLastEntry: number | null;
  milestone: Milestone;
  /** Human-readable label used for fallback copy and the milestone "tag". */
  milestoneLabel: string;
}

export interface EncouragementBanner {
  headline: string;
  subline: string;
}

const CACHE_PREFIX = "strand_journal_banner_v1";

const todayKey = () => new Date().toISOString().slice(0, 10);

const parseEntryDate = (s: string): Date | null => {
  // entries are formatted like "14 Apr 2026"
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const computeSignals = (createdAt: string | null | undefined): JournalSignals => {
  const now = new Date();
  const createdDate = createdAt ? new Date(createdAt) : now;
  const daysSinceSignup = Math.max(
    0,
    Math.floor((now.getTime() - createdDate.getTime()) / 86_400_000),
  );

  const entryDates = journalEntries
    .map((e) => parseEntryDate(e.date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  const entryCount = entryDates.length;
  const daysSinceLastEntry = entryDates.length
    ? Math.max(
        0,
        Math.floor((now.getTime() - entryDates[0].getTime()) / 86_400_000),
      )
    : null;

  let milestone: Milestone;
  let milestoneLabel: string;

  if (entryCount === 0) {
    milestone = "first_entry_pending";
    milestoneLabel = "Start your journal";
  } else if (daysSinceSignup >= 365) {
    const years = Math.floor(daysSinceSignup / 365);
    milestone = years >= 1 && daysSinceSignup < 400 ? "month_12" : "year_plus";
    milestoneLabel = years === 1 ? "1 Year with STRAND" : `${years} Years with STRAND`;
  } else if (daysSinceSignup >= 180) {
    milestone = "month_6";
    milestoneLabel = "6 Months with STRAND";
  } else if (daysSinceSignup >= 90) {
    milestone = "month_3";
    milestoneLabel = "3 Months with STRAND";
  } else if (daysSinceSignup >= 30) {
    milestone = "month_1";
    milestoneLabel = "1 Month with STRAND";
  } else if (daysSinceSignup >= 7) {
    milestone = "first_week";
    milestoneLabel = "1 Week with STRAND";
  } else if (daysSinceLastEntry !== null && daysSinceLastEntry >= 21) {
    milestone = "comeback";
    milestoneLabel = "Welcome back";
  } else if (entryCount >= 3 && (daysSinceLastEntry ?? 99) <= 7) {
    milestone = "streak";
    milestoneLabel = `${entryCount} entries logged`;
  } else {
    milestone = "keep_going";
    milestoneLabel = "Keep tracking";
  }

  return { daysSinceSignup, entryCount, daysSinceLastEntry, milestone, milestoneLabel };
};

const fallbackBanner = (s: JournalSignals): EncouragementBanner => {
  switch (s.milestone) {
    case "first_entry_pending":
      return {
        headline: "📷 Start your hair journal",
        subline: "Log your first wash day to track what works.",
      };
    case "first_week":
      return {
        headline: "🌱 One week in",
        subline: "Small notes today become big patterns later.",
      };
    case "month_1":
      return {
        headline: "✨ One month with STRAND",
        subline: "You are building a record only you can use.",
      };
    case "month_3":
      return {
        headline: "🌟 3 months tracking",
        subline: "Consistency is the work — keep going.",
      };
    case "month_6":
      return {
        headline: "💫 6 months in",
        subline: "Your data is starting to tell a real story.",
      };
    case "month_12":
      return {
        headline: "🎉 1 year with STRAND",
        subline: "A full year of notes you can look back on.",
      };
    case "year_plus":
      return {
        headline: "🏆 Long-term tracker",
        subline: "Your archive keeps every wash day in one place.",
      };
    case "comeback":
      return {
        headline: "👋 Welcome back",
        subline: "Pick up where you left off with a quick entry.",
      };
    case "streak":
      return {
        headline: "🔥 You are on a roll",
        subline: `${s.entryCount} entries logged. Add today's notes.`,
      };
    default:
      return {
        headline: "🌿 Today's wash day",
        subline: "Note what worked and what did not.",
      };
  }
};

export const useJournalEncouragement = () => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<JournalSignals | null>(null);
  const [banner, setBanner] = useState<EncouragementBanner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = computeSignals(user?.created_at);
    setSignals(s);

    // Cache key combines user, milestone, and the date so the copy refreshes
    // at most once per day per state — saves AI credits.
    const cacheKey = `${CACHE_PREFIX}:${user?.id ?? "anon"}:${s.milestone}:${todayKey()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setBanner(JSON.parse(cached));
        setLoading(false);
        return;
      } catch {
        /* ignore */
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "journal-encouragement",
          { body: s },
        );
        if (cancelled) return;
        if (error || !data?.banner) {
          setBanner(fallbackBanner(s));
        } else {
          setBanner(data.banner);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data.banner));
          } catch {
            /* quota — ignore */
          }
        }
      } catch {
        if (!cancelled) setBanner(fallbackBanner(s));
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
