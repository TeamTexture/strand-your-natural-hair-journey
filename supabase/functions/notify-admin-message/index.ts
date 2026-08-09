// Emails admins when a new contact message arrives.
// The email never reproduces the message body — its CTA deep links straight to
// the message inside STRAND (/admin/messages?enquiry=<id>), which survives the
// login redirect via ?next=.
// Fire-and-forget: always returns 200 so the DB trigger never blocks the insert.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message_id } = await req.json().catch(() => ({}));
    if (!message_id) return json({ ok: false, reason: "missing message_id" });

    const admin = serviceClient();

    const { data: msg, error } = await admin
      .from("contact_messages")
      .select("id, name, email, subject, created_at")
      .eq("id", message_id)
      .maybeSingle();

    if (error || !msg) {
      console.warn("notify-admin-message: message not found", error);
      return json({ ok: false, reason: "not_found" });
    }

    const recipients = await resolveAdminEmails(admin);
    if (recipients.length === 0) return json({ ok: true, skipped: "no_recipients" });

    const received = new Date(msg.created_at).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const result = await dispatchEmail(
      {
        templateKey: "admin-new-message",
        to: recipients,
        triggerEvent: "contact_message.created",
        relatedTable: "contact_messages",
        relatedId: String(msg.id),
        idempotencyKey: `admin-new-message:${msg.id}`,
        data: {
          fromName: msg.name || msg.email || "Someone",
          subject: msg.subject || "Enquiry",
          received,
          // Deep link to the exact message.
          path: `/admin/messages?enquiry=${msg.id}`,
        },
      },
      admin,
    );

    if (!result.sent) console.warn("notify-admin-message: not sent", JSON.stringify(result));
    return json({ ok: true, ...result, recipients: recipients.length });
  } catch (err) {
    console.error("notify-admin-message error", err);
    return json({ ok: true, error: String(err) });
  }
});

async function resolveAdminEmails(admin: SupabaseClient): Promise<string[]> {
  const emails = new Set<string>();

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

  try {
    const { data: adminRows } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    for (const row of adminRows ?? []) {
      const { data: userRes } = await admin.auth.admin.getUserById(row.user_id);
      const em = userRes?.user?.email;
      if (em) emails.add(em.toLowerCase());
    }
  } catch (e) {
    console.warn("resolveAdminEmails: role lookup failed", e);
  }

  return Array.from(emails);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
