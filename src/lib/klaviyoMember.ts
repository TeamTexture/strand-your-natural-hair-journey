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
