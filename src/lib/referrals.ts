import { supabase } from "@/integrations/supabase/client";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

/**
 * Referral tracking for directory listings.
 *
 * Tier C (external_link) professionals get a tracked outbound link: we append
 * UTM parameters and log the click to `pro_referral_clicks` so admin can
 * attribute a booking back to STRAND.
 *
 * Tiers A and B log an attribution event when an enquiry converts.
 */

/** Add STRAND UTM parameters to a professional's own URL. */
export function buildTrackedUrl(rawUrl: string, professionalId: string): string {
  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    url.searchParams.set("utm_source", "strand");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "strand_directory");
    url.searchParams.set("utm_content", professionalId);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/** Fire-and-forget click log. Never blocks the outbound navigation. */
export async function logReferralClick(params: {
  targetUrl: string;
  proUserId?: string | null;
  directoryId?: string | null;
}) {
  try {
    const { data: auth } = await getDisplayedAuthUser();
    const userId = auth.user?.id;
    if (!userId) return;
    await supabase.from("pro_referral_clicks").insert({
      user_id: userId,
      pro_user_id: params.proUserId ?? null,
      directory_id: params.directoryId ?? null,
      target_url: params.targetUrl,
    });
  } catch (err) {
    console.warn("referral click log failed", err);
  }
}

/** Log an attribution event (enquiry sent, or enquiry → booked appointment).
 *  Goes through the `log_referral_attribution` routine so the row is always
 *  stamped with the signed-in member, carries no monetary values, and can only
 *  reference the member's own enquiry / appointment. */
export async function logReferralAttribution(params: {
  eventType: "enquiry" | "booking";
  proUserId?: string | null;
  directoryId?: string | null;
  enquiryId?: string | null;
  appointmentId?: string | null;
}) {
  try {
    const { data: auth } = await getDisplayedAuthUser();
    if (!auth.user?.id) return;
    const { error } = await supabase.rpc("log_referral_attribution" as never, {
      p_event_type: params.eventType,
      p_pro_user_id: params.proUserId ?? null,
      p_directory_id: params.directoryId ?? null,
      p_enquiry_id: params.enquiryId ?? null,
      p_appointment_id: params.appointmentId ?? null,
    } as never);
    if (error) throw error;
  } catch (err) {
    console.warn("referral attribution log failed", err);
  }
}

