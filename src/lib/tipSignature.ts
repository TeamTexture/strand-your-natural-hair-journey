// tipSignature — shared invalidation signals for the responsive `ai_summaries`
// tip kinds (style_tip, wash_day_tip, wash_day_steps).
//
// Every responsive tip is cached server-side against a signature. A tip
// regenerates when EITHER the calendar day rolls over (preserving the
// "tip of the day" cadence) OR the signature changes — whichever comes first.

import { supabase } from "@/integrations/supabase/client";

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
  /** Free-text challenges the member wrote on their goals (user_goals.challenge). */
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
      .select("challenge, status")
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
    challenges: ((goalsRes.data ?? []) as Array<{ challenge: string | null }>)
      .map((g) => (g.challenge ?? "").trim())
      .filter(Boolean),
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
 */
export const responsiveSignatureParts = (signals: ResponsiveSignals): string[] => [
  `day:${londonDayKey()}`,
  `challenges:${[...signals.challenges].sort().join("|")}`,
  `concerns:${[...signals.areasOfConcern].sort().join("|")}`,
  `wash:${signals.recentWashDay ? `${signals.recentWashDay.id}@${signals.recentWashDay.date}` : ""}`,
  `appt:${signals.recentAppointment ? `${signals.recentAppointment.id}@${signals.recentAppointment.date}` : ""}`,
];

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
