import { supabase } from "@/integrations/supabase/client";

/**
 * Adds the signed-in STRAND member to the member mailing list.
 * Fire-and-forget: never let list sync break a sign-up. Server-side the call
 * skips professionals, brands, admins and international-blocked accounts.
 */
export async function addMemberToMailingList(): Promise<void> {
  try {
    await supabase.functions.invoke("klaviyo-member-sync", { body: { mode: "self" } });
  } catch {
    // Ignored by design.
  }
}

/**
 * Reports that this member has reached the trial paywall (i.e.
 * `profiles.trial_offer_at` has just been stamped at sign-up) so Klaviyo's
 * "Reached Paywall, No Checkout" nurture list can pick her up.
 *
 * Server-side the push is idempotent, consent-gated and skipped entirely when
 * she already has an active/trialing subscription. Fire-and-forget: a Klaviyo
 * problem must never break registration.
 */
export async function reportPaywallReached(): Promise<void> {
  try {
    await supabase.functions.invoke("klaviyo-nurture", { body: { mode: "paywall" } });
  } catch {
    // Ignored by design.
  }
}
