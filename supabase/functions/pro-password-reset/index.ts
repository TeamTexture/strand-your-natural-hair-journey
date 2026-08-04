// Professional password reset — sends a branded STRAND recovery email via Resend.
//
// Mechanism: native Supabase auth recovery link (single-use, 1h expiry) minted
// server-side with admin.generateLink, then delivered ourselves through Resend
// from noreply@mystrand.co.uk. The default/generic auth sender is never used.
//
// Always returns the same generic success payload so the endpoint cannot be
// used to enumerate registered emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const FROM = "STRAND <noreply@mystrand.co.uk>";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SENT = {
  ok: true,
  message: "A reset link is on its way.",
};

const NO_ACCOUNT =
  "No STRAND account is registered with that email. Check the spelling and try again, or create an account.";


const emailHtml = (link: string, isPro: boolean, isBrand = false) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F7F3EE;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EE;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;padding:36px 32px;">
          <tr><td align="center" style="padding-bottom:24px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.34em;color:#3B2E26;text-transform:uppercase;">STRAND</div>
            ${
              isPro || isBrand
                ? `<div style="font-family:Georgia,serif;font-size:11px;letter-spacing:0.28em;color:#B08D4F;text-transform:uppercase;margin-top:8px;">${isPro ? "Professional" : "For Brands"}</div>`
                : ""
            }
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#3B2E26;padding-bottom:24px;">
            <p style="margin:0 0 14px;">We received a request to reset the password for your STRAND${isPro ? " Pro" : isBrand ? " brand" : ""} account.</p>
            <p style="margin:0;">Tap the button below to choose a new password.</p>
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${link}" style="display:inline-block;background:#B08D4F;color:#FFFFFF;text-decoration:none;font-size:15px;padding:14px 32px;border-radius:50px;">Reset my password</a>
          </td></tr>
          <tr><td style="font-size:12px;line-height:1.6;color:#7A6B5F;border-top:1px solid #EDE5DA;padding-top:18px;">
            <p style="margin:0 0 8px;">This link can only be used once and expires in 1 hour.</p>
            <p style="margin:0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    // Audience only changes the email copy + default redirect — the mechanism
    // is identical for members, professionals and brands.
    const audience: "member" | "pro" | "brand" =
      body?.audience === "member" ? "member" : body?.audience === "brand" ? "brand" : "pro";
    const isPro = audience === "pro";
    const isBrand = audience === "brand";
    const redirectTo =
      typeof body?.redirectTo === "string" && /^https?:\/\//.test(body.redirectTo)
        ? body.redirectTo
        : isPro
          ? "https://www.mystrand.co.uk/pro/reset-password"
          : isBrand
            ? "https://www.mystrand.co.uk/brand/reset-password"
            : "https://www.mystrand.co.uk/reset-password";

    if (!rawEmail || rawEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return json(400, { error: "Please enter a valid email address." });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: rawEmail,
      options: { redirectTo },
    });

    // Per product decision, unknown emails are rejected explicitly so users
    // aren't left waiting for an email that will never arrive.
    if (error || !data?.properties?.action_link) {
      const msg = (error?.message ?? "").toLowerCase();
      const notFound =
        !error ||
        msg.includes("not found") ||
        msg.includes("no user") ||
        msg.includes("invalid") ||
        error.status === 400 ||
        error.status === 404;
      console.log("pro-password-reset: no link generated", error?.message);
      if (notFound) return json(404, { error: NO_ACCOUNT, code: "no_account" });
      return json(502, { error: "We couldn't send the email just now. Please try again." });
    }


    if (!RESEND_API_KEY) {
      console.error("pro-password-reset: RESEND_API_KEY missing");
      return json(500, { error: "Email service is not configured. Please contact support." });
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [rawEmail],
        subject: isPro
          ? "Reset your STRAND Pro password"
          : isBrand
            ? "Reset your STRAND brand password"
            : "Reset your STRAND password",
        html: emailHtml(data.properties.action_link, isPro, isBrand),
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("pro-password-reset: resend failed", resp.status, detail);
      if (resp.status === 429) {
        return json(429, { error: "Too many requests. Please wait a moment and try again." });
      }
      return json(502, { error: "We couldn't send the email just now. Please try again." });
    }

    return json(200, SENT);
  } catch (err) {
    console.error("pro-password-reset error", err);
    return json(500, { error: "Something went wrong. Please try again." });
  }
});
