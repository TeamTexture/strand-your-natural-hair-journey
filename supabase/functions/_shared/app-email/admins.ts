// Resolves the internal admin notification recipient list.
// ONE place, so every admin alert reaches the same inbox set.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

/** Always notified, regardless of platform settings or role rows. */
export const ADMIN_FALLBACK_EMAIL = "paige.lewin@gmail.com";

export async function resolveAdminEmails(admin: SupabaseClient): Promise<string[]> {
  const emails = new Set<string>([ADMIN_FALLBACK_EMAIL]);

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

  return Array.from(emails);
}
