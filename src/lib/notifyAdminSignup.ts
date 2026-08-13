import { supabase } from "@/integrations/supabase/client";

/**
 * Tells the STRAND admin team that a new account has registered.
 * Fire-and-forget: never let this break the sign-up it reports on.
 */
export async function notifyAdminSignup(
  kind: "member" | "professional" | "brand",
  opts: { name?: string | null; note?: string | null } = {},
): Promise<void> {
  try {
    await supabase.functions.invoke("notify-admin-signup", {
      body: { kind, name: opts.name ?? null, note: opts.note ?? null },
    });
  } catch {
    // Ignored by design.
  }
}
