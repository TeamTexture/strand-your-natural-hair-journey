// Password reset for members, professionals and brands.
//
// Mechanism: native Supabase auth recovery link (single-use, 1h expiry) minted
// server-side with admin.generateLink, then delivered through the single STRAND
// send path (_shared/app-email) from noreply@mystrand.co.uk. The default/generic
// auth sender is never used, and every attempt lands in email_log.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import { APP_BASE_URL } from "../_shared/app-email/config.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    // Audience only changes the email copy + default redirect — the mechanism
    // is identical for members, professionals and brands.
    const audience: "member" | "pro" | "brand" =
      body?.audience === "member" ? "member" : body?.audience === "brand" ? "brand" : "pro";
    const redirectTo =
      typeof body?.redirectTo === "string" && /^https?:\/\//.test(body.redirectTo)
        ? body.redirectTo
        : audience === "pro"
          ? `${APP_BASE_URL}/pro/reset-password`
          : audience === "brand"
            ? `${APP_BASE_URL}/brand/reset-password`
            : `${APP_BASE_URL}/reset-password`;

    if (!rawEmail || rawEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return json(400, { error: "Please enter a valid email address." });
    }

    const admin = serviceClient();

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

    const result = await dispatchEmail(
      {
        templateKey: "password-reset",
        to: rawEmail,
        recipientUserId: data.user?.id ?? null,
        triggerEvent: `password_reset.${audience}`,
        data: { audience, link: data.properties.action_link },
      },
      admin,
    );

    if (!result.sent) {
      console.error("pro-password-reset: send failed", JSON.stringify(result));
      if (result.status === 429) {
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
