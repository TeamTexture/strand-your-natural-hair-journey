// tipSignature — invalidation signals for the `ai_summaries` tip kinds.
//
// TWO FAMILIES, DELIBERATELY SEPARATE:
//
// 1. RESPONSIVE tips (style_tip, wash_day_tip, wash_day_steps) use
//    `loadResponsiveSignals` + `responsiveSignatureParts`. They regenerate when
//    the calendar day rolls over OR the signature changes — whichever first.
//    A logged wash day MUST move these.
//
// 2. The STATIC home STRAND tip uses `strandTipSignatureParts` ONLY. It has no
//    calendar day and no event/challenge/concern inputs: it moves only when the
//    current style, the planned next style or the goal changes. Never add a
//    responsive input to it — that is the whole point of the split.


import { supabase } from "@/integrations/supabase/client";
import { allChallenges } from "@/lib/goalChallenges";
import { aiRevisionPart } from "@/lib/aiCopyRevision";

/**
 * A wash day or appointment older than this is history, not a current event,
 * so it stops contributing to the signature.
 */
export const RECENT_EVENT_WINDOW_DAYS = 45;

export const hashString = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

/** Calendar day in the member's timezone — rolls the tip over at midnight. */
export const londonDayKey = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

export interface RecentEvent {
  id: string;
  date: string;
}

export interface ResponsiveSignals {
  /** Every challenge across the member's goals (user_goals.challenges). */
  challenges: string[];
  /** user_hair_profile.areas_of_concern */
  areasOfConcern: string[];
  /** Most recent wash day inside RECENT_EVENT_WINDOW_DAYS. */
  recentWashDay: RecentEvent | null;
  /** Most recent appointment inside RECENT_EVENT_WINDOW_DAYS. */
  recentAppointment: RecentEvent | null;
}

const windowStartIso = (): string => {
  const d = new Date(Date.now() - RECENT_EVENT_WINDOW_DAYS * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/**
 * Loads the signals that change often and must invalidate a cached tip:
 * challenges/concerns, the latest wash day and the latest appointment.
 */
export async function loadResponsiveSignals(userId: string): Promise<ResponsiveSignals> {
  const since = windowStartIso();
  const [goalsRes, hairRes, washRes, apptRes] = await Promise.all([
    supabase
      .from("user_goals")
      .select("challenges, challenge, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10),
    supabase
      .from("user_hair_profile")
      .select("areas_of_concern")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("wash_days")
      .select("id, wash_date")
      .eq("user_id", userId)
      .gte("wash_date", since)
      .order("wash_date", { ascending: false })
      .limit(1),
    supabase
      .from("appointments")
      .select("id, appointment_date")
      .eq("user_id", userId)
      .gte("appointment_date", since)
      .order("appointment_date", { ascending: false })
      .limit(1),
  ]);

  const wash = (washRes.data ?? [])[0] as { id: string; wash_date: string } | undefined;
  const appt = (apptRes.data ?? [])[0] as
    | { id: string; appointment_date: string }
    | undefined;

  return {
    // Every challenge across the member's active goals. Adding one changes the
    // signature, so guidance refreshes on the next fetch.
    challenges: allChallenges(
      (goalsRes.data ?? []) as Array<{ challenges?: string[] | null; challenge?: string | null }>,
    ),
    areasOfConcern:
      ((hairRes.data as { areas_of_concern?: string[] } | null)?.areas_of_concern ?? [])
        .map(String)
        .filter(Boolean),
    recentWashDay: wash ? { id: wash.id, date: wash.wash_date } : null,
    recentAppointment: appt ? { id: appt.id, date: appt.appointment_date } : null,
  };
}

/**
 * The signature fragments contributed by the responsive signals plus the
 * calendar day. Order is stable so the hash is stable.
 *
 * Surfaces that must stay STATIC until the member's picture actually changes
 * (the Strand tip on Home) opt out of the calendar day and of the recent
 * wash day / appointment fragments, so no AI call is spent on a rollover.
 */
export const responsiveSignatureParts = (
  signals: ResponsiveSignals,
  opts?: { includeDay?: boolean; includeEvents?: boolean },
): string[] => {
  // The AI copy revision leads every signature: a manuscript/prompt change
  // must invalidate a cached tip even when the member's data is untouched.
  const parts: string[] = [aiRevisionPart];
  if (opts?.includeDay !== false) parts.push(`day:${londonDayKey()}`);
  parts.push(
    `challenges:${[...signals.challenges].sort().join("|")}`,
    `concerns:${[...signals.areasOfConcern].sort().join("|")}`,
  );
  if (opts?.includeEvents !== false) {
    parts.push(
      `wash:${signals.recentWashDay ? `${signals.recentWashDay.id}@${signals.recentWashDay.date}` : ""}`,
      `appt:${signals.recentAppointment ? `${signals.recentAppointment.id}@${signals.recentAppointment.date}` : ""}`,
    );
  }
  return parts;
};

/** Style fields that must always contribute — current AND planned, with attrs. */
export const styleSignatureParts = (
  style: Record<string, unknown> | null,
): string[] => {
  const v = (k: string) => {
    const x = style?.[k];
    return x === null || x === undefined ? "" : String(x);
  };
  return [
    `cur:${v("current_hairstyle")}`,
    `curExt:${v("current_style_extensions")}`,
    `curTen:${v("current_style_tension")}`,
    `plan:${v("planned_next_style")}`,
    `planExt:${v("planned_style_extensions")}`,
    `planTen:${v("planned_style_tension")}`,
  ];
};

// ---------------------------------------------------------------------------
// The home STRAND tip — STATIC signature.
//
// Exactly three inputs, and nothing else:
//   1. user_style_profile.current_hairstyle
//   2. user_style_profile.planned_next_style
//   3. the member's goal (id + wording + target)
//
// No calendar day, no wash days, no appointments, no challenges, no concerns,
// no blood results. Once generated the tip persists indefinitely until one of
// the three above changes. Do NOT route this through
// `responsiveSignatureParts` — that helper serves the responsive tips.
// ---------------------------------------------------------------------------

export interface StrandTipGoalFields {
  id?: string | null;
  title?: string | null;
  target_text?: string | null;
  target_date?: string | null;
}

/** The ONLY style fields the static STRAND tip watches. */
export const strandTipStyleColumns = "current_hairstyle, planned_next_style";

export const strandTipSignatureParts = (
  style: Record<string, unknown> | null,
  goal: StrandTipGoalFields | null,
): string[] => {
  const s = (k: string) => {
    const x = style?.[k];
    return x === null || x === undefined ? "" : String(x);
  };
  const g = (v: string | null | undefined) => v ?? "";
  return [
    // Revision first: the static tip is otherwise immune to everything except
    // the three data points, which would strand it on pre-correction copy.
    aiRevisionPart,
    `cur:${s("current_hairstyle")}`,
    `plan:${s("planned_next_style")}`,
    `goal:${g(goal?.id)}`,
    `goalTitle:${g(goal?.title)}`,
    `goalTarget:${g(goal?.target_text)}`,
    `goalDate:${g(goal?.target_date)}`,
  ];
};
