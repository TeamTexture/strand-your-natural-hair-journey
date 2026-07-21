// Sends an email to admins when a new pro_application is submitted.
// Fire-and-forget: any failure returns 200 so the DB trigger never blocks the insert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_APP_URL = "https://strand-hair-journal.lovable.app/admin/applications";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { application_id } = await req.json().catch(() => ({}));
    if (!application_id) {
      return json({ ok: false, reason: "missing application_id" }, 200);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

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

    if (!RESEND_API_KEY) {
      console.log("notify-admin-application: RESEND_API_KEY not set, skipping send");
      return json({ ok: true, skipped: "no_api_key", recipients: recipients.length }, 200);
    }

    const submitted = new Date(app.created_at).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const subject = `New STRAND professional application — ${app.full_name}`;
    const html = renderEmail({
      fullName: app.full_name,
      discipline: String(app.discipline).replaceAll("_", " "),
      businessName: app.business_name,
      email: app.email,
      submitted,
      link: ADMIN_APP_URL,
    });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "STRAND <notifications@mystrand.co.uk>",
        to: recipients,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`notify-admin-application: Resend ${resp.status} — ${body}`);
      return json({ ok: true, sent: false, status: resp.status }, 200);
    }

    return json({ ok: true, sent: true, recipients: recipients.length }, 200);
  } catch (err) {
    console.error("notify-admin-application error", err);
    // Always 200: this is fire-and-forget.
    return json({ ok: true, error: String(err) }, 200);
  }
});

async function resolveAdminEmails(admin: ReturnType<typeof createClient>): Promise<string[]> {
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
    .map((s) => s.trim())
    .filter((s) => s && s.includes("@"))
    .forEach((s) => emails.add(s.toLowerCase()));

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

function renderEmail(d: {
  fullName: string;
  discipline: string;
  businessName: string | null;
  email: string;
  submitted: string;
  link: string;
}) {
  const brand = "#8B6914";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F7F1E7;font-family:Georgia,'Times New Roman',serif;color:#2b2317;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;border:1px solid #E8DDC5;">
        <tr><td style="padding:28px 32px 12px;">
          <div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${brand};font-family:Arial,Helvetica,sans-serif;">STRAND · Admin</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#1f1a12;">New professional application</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3a3225;">
          A new applicant is waiting for review.
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#3a3225;">
            ${row("Name", escapeHtml(d.fullName))}
            ${row("Discipline", escapeHtml(d.discipline))}
            ${d.businessName ? row("Business", escapeHtml(d.businessName)) : ""}
            ${row("Email", escapeHtml(d.email))}
            ${row("Submitted", escapeHtml(d.submitted))}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;" align="left">
          <a href="${d.link}" style="display:inline-block;background:${brand};color:#FFFFFF;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.02em;padding:11px 20px;border-radius:999px;">Review application</a>
        </td></tr>
        <tr><td style="padding:0 32px 26px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a7f6b;">
          You're receiving this because you're an admin on STRAND.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;width:110px;color:#8a7f6b;text-transform:uppercase;font-size:10px;letter-spacing:0.12em;">${label}</td>
    <td style="padding:6px 0;color:#2b2317;">${value}</td>
  </tr>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
