// Resolves the internal admin notification recipient list.
// ONE place, so every admin alert reaches the same inbox set.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Fallback admin inbox. Held in the `ADMIN_FALLBACK_EMAIL` secret — never
 * hard-coded, so member data can't be posted to an address baked into the repo.
 * When it is unset we simply do not add one; if that leaves NO recipients,
 * `resolveAdminEmails` throws so the failure is loud instead of silent.
 */
export function adminFallbackEmail(): string | null {
  const raw = (Deno.env.get("ADMIN_FALLBACK_EMAIL") ?? "").trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

export async function resolveAdminEmails(admin: SupabaseClient): Promise<string[]> {
  const emails = new Set<string>();
  const fallback = adminFallbackEmail();
  if (fallback) emails.add(fallback);

  // 1. platform_settings override (JSON string, comma/semicolon separated).
  try {
    const { data: setting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "admin_notification_email")
      .maybeSingle();
    const raw = typeof setting?.value === "string" ? setting.value : "";
    raw
      .split(/[,;\s]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s && s.includes("@"))
      .forEach((s: string) => emails.add(s.toLowerCase()));
  } catch (e) {
    console.warn("resolveAdminEmails: settings lookup failed", e);
  }

  // 2. Every user holding the admin role.
  try {
    const { data: rows } = await admin.from("user_roles").select("user_id").eq("role", "admin");
    for (const row of rows ?? []) {
      const { data: userRes } = await admin.auth.admin.getUserById(
        (row as { user_id: string }).user_id,
      );
      const em = userRes?.user?.email;
      if (em) emails.add(em.toLowerCase());
    }
  } catch (e) {
    console.warn("resolveAdminEmails: role lookup failed", e);
  }

  const list = Array.from(emails);
  if (list.length === 0) {
    // Loud failure: no configured fallback, no platform setting, no admin role
    // rows. Better to error and log than to guess an inbox.
    throw new Error(
      "resolveAdminEmails: no admin recipients configured (set the ADMIN_FALLBACK_EMAIL secret or the admin_notification_email platform setting)",
    );
  }
  return list;
}
