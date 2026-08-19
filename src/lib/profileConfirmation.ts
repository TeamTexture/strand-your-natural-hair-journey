// Profile reconfirmation — non-destructive.
//
// Until August 2026 onboarding pre-filled some answers on the member's behalf
// (diet, porosity, diagnosed conditions, current style). We cannot tell which
// stored answers a member actually chose, so we ask her to confirm them in her
// own words. `profiles.profile_confirmed_at` is null until she has revisited
// and saved all three review sections. Nothing here ever clears or overwrites
// an existing answer — the review screens load her stored values and she
// confirms or corrects them.

import { supabase } from "@/integrations/supabase/client";
import { invalidateAiContextCache } from "@/lib/aiContext";

export const CONFIRM_SECTIONS = ["hair", "health", "colour"] as const;
export type ConfirmSection = (typeof CONFIRM_SECTIONS)[number];

export const CONFIRM_SECTION_META: Array<{
  section: ConfirmSection;
  label: string;
  route: string;
  questions: number;
}> = [
  { section: "hair", label: "Hair characteristics", route: "/profile/hair", questions: 10 },
  { section: "health", label: "Health and diet", route: "/profile/health", questions: 11 },
  { section: "colour", label: "Colour and style", route: "/profile/colour", questions: 9 },
];

const key = (userId: string) => `strand_profile_reconfirm_${userId}`;
/** Dismissal is session-scoped on purpose: "Remind me later" comes back on the
 *  next sign-in, and never nags twice within one session. */
export const SESSION_DISMISS_KEY = "strand_profile_reconfirm_snoozed";

export function readConfirmedSections(userId: string | null | undefined): ConfirmSection[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return CONFIRM_SECTIONS.filter((s) => parsed.includes(s));
  } catch {
    return [];
  }
}

export function clearConfirmedSections(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    // Ignore private-browsing storage failures.
  }
}

/**
 * Record that the member has reviewed and saved one section. When all three
 * are done, stamp `profile_confirmed_at`. Only ever writes that one column.
 */
export async function markSectionConfirmed(
  userId: string | null | undefined,
  section: ConfirmSection,
): Promise<{ allConfirmed: boolean }> {
  if (!userId) return { allConfirmed: false };
  const next = Array.from(new Set([...readConfirmedSections(userId), section]));
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    // Ignore private-browsing storage failures.
  }
  const allConfirmed = CONFIRM_SECTIONS.every((s) => next.includes(s));
  if (allConfirmed) {
    const { error } = await supabase
      .from("profiles")
      .update({ profile_confirmed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("profile_confirmed_at", null);
    if (error) throw error;
    invalidateAiContextCache();
  }
  return { allConfirmed };
}

/** Members who onboard from now on answer every question explicitly, so they
 *  are confirmed by definition. Called at the end of the onboarding flow. */
export async function stampProfileConfirmedOnOnboarding(userId: string) {
  await supabase
    .from("profiles")
    .update({ profile_confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("profile_confirmed_at", null);
}
