import { supabase } from "@/integrations/supabase/client";

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
    const { data: auth } = await supabase.auth.getUser();
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

/** Log an attribution event (enquiry sent, or enquiry → booked appointment). */
export async function logReferralAttribution(params: {
  eventType: "enquiry" | "booking";
  proUserId?: string | null;
  directoryId?: string | null;
  enquiryId?: string | null;
  appointmentId?: string | null;
}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;
    await supabase.from("pro_referral_attributions").insert({
      consumer_id: userId,
      pro_user_id: params.proUserId ?? null,
      directory_id: params.directoryId ?? null,
      enquiry_id: params.enquiryId ?? null,
      appointment_id: params.appointmentId ?? null,
      event_type: params.eventType,
    });
  } catch (err) {
    console.warn("referral attribution log failed", err);
  }
}
