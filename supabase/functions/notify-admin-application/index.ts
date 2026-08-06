// Sends an email to admins when a new pro_application is submitted.
// Composition/transmission is delegated to the single send path so this email
// is logged in email_log like every other STRAND email.
// Fire-and-forget: any failure returns 200 so the DB trigger never blocks the insert.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { application_id } = await req.json().catch(() => ({}));
    if (!application_id) {
      return json({ ok: false, reason: "missing application_id" }, 200);
    }

    const admin = serviceClient();

    // Load the application
    const { data: app, error: appErr } = await admin
      .from("pro_applications")
      .select("id, full_name, email, discipline, business_name, created_at")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !app) {
      console.warn("notify-admin-application: application not found", appErr);
      return json({ ok: false, reason: "not_found" }, 200);
    }

    // Resolve recipient list
    const recipients = await resolveAdminEmails(admin);
    if (recipients.length === 0) {
      console.log("notify-admin-application: no admin recipients configured");
      return json({ ok: true, skipped: "no_recipients" }, 200);
    }

    const submitted = new Date(app.created_at).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const result = await dispatchEmail(
      {
        templateKey: "admin-application-received",
        to: recipients,
        triggerEvent: "pro_application.submitted",
        relatedTable: "pro_applications",
        relatedId: String(app.id),
        idempotencyKey: `admin-application-received:${app.id}`,
        data: {
          fullName: app.full_name,
          discipline: String(app.discipline ?? "").replaceAll("_", " "),
          businessName: app.business_name ?? "",
          email: app.email,
          submitted,
        },
      },
      admin,
    );

    if (!result.sent) {
      console.warn("notify-admin-application: not sent", JSON.stringify(result));
    }
    return json({ ok: true, ...result, recipients: recipients.length }, 200);
  } catch (err) {
    console.error("notify-admin-application error", err);
    // Always 200: this is fire-and-forget.
    return json({ ok: true, error: String(err) }, 200);
  }
});

async function resolveAdminEmails(admin: SupabaseClient): Promise<string[]> {
  const emails = new Set<string>();

  // 1. platform_settings override (JSON string, comma-separated allowed)
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

  // 2. All users with admin role
  try {
    const { data: adminRows } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (adminRows && adminRows.length) {
      for (const row of adminRows) {
        const { data: userRes } = await admin.auth.admin.getUserById(row.user_id);
        const em = userRes?.user?.email;
        if (em) emails.add(em.toLowerCase());
      }
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
