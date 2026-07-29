// Tier B (listed_enquiry) directory enquiry.
//
// Tier B professionals are listed in the STRAND directory and receive
// enquiries through the app, but have no subscription, no dashboard, no chat
// and no passport access — so the enquiry is forwarded to their registered
// email instead of landing in an in-app inbox.
//
// Also logs an attribution row so admin can see enquiry volume per pro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "Missing auth" });

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json(401, { error: "Not authenticated" });

    const body = await req.json().catch(() => ({}));
    const directoryId: string | null = body.directory_id ?? null;
    const proUserId: string | null = body.pro_user_id ?? null;
    const message = String(body.message ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    if (!directoryId && !proUserId) return json(400, { error: "Missing professional" });
    if (message.length < 5 || message.length > 2000) {
      return json(400, { error: "Please write a short message (5–2000 characters)." });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Resolve the professional's registered email + name.
    let proName = "there";
    let proEmail: string | null = null;
    if (directoryId) {
      const { data } = await admin
        .from("professionals_directory")
        .select("name, contact_email, listing_tier")
        .eq("id", directoryId)
        .maybeSingle();
      if (data) {
        proName = data.name ?? proName;
        proEmail = (data as { contact_email?: string | null }).contact_email ?? null;
      }
    }
    if (!proEmail && proUserId) {
      const { data } = await admin
        .from("pro_profiles")
        .select("display_name, contact_email, business_email")
        .eq("user_id", proUserId)
        .maybeSingle();
      if (data) {
        proName = data.display_name ?? proName;
        proEmail = data.contact_email ?? data.business_email ?? null;
      }
    }

    // Sender details.
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const senderName = profile?.full_name ?? "A STRAND member";
    const senderEmail = user.email ?? "";

    // Attribution row (best-effort — never blocks the enquiry).
    await admin
      .from("pro_referral_attributions")
      .insert({
        consumer_id: user.id,
        pro_user_id: proUserId,
        directory_id: directoryId,
        event_type: "enquiry",
        notes: "Tier B directory enquiry",
      })
      .then(undefined, (e: unknown) => console.warn("attribution insert failed", e));

    if (!proEmail) {
      return json(200, { ok: true, delivered: false, reason: "no_email_on_file" });
    }
    if (!RESEND_API_KEY) {
      console.log("directory-enquiry: RESEND_API_KEY not set, skipping send");
      return json(200, { ok: true, delivered: false, reason: "email_not_configured" });
    }

    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#2b2118;line-height:1.5">
        <h2 style="font-family:Georgia,serif;color:#8a6a2f;margin:0 0 12px">New STRAND enquiry</h2>
        <p>Hi ${esc(proName)},</p>
        <p><strong>${esc(senderName)}</strong> found you in the STRAND professional directory and would like to get in touch.</p>
        <div style="border-left:3px solid #c9a227;padding:8px 14px;margin:16px 0;background:#faf7f1">
          ${esc(message).replace(/\n/g, "<br/>")}
        </div>
        <p style="margin:0"><strong>Reply to:</strong> ${esc(senderEmail)}</p>
        ${phone ? `<p style="margin:4px 0 0"><strong>Phone:</strong> ${esc(phone)}</p>` : ""}
        <p style="font-size:12px;color:#7a6b58;margin-top:24px">
          Sent via STRAND. Reply directly to this email to reach the member.
        </p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "STRAND <info@teamtexture.co.uk>",
        to: [proEmail],
        reply_to: senderEmail || undefined,
        subject: `New STRAND enquiry from ${senderName}`,
        html,
      }),
    });

    if (!resp.ok) {
      console.warn("directory-enquiry: resend failed", resp.status, await resp.text());
      return json(200, { ok: true, delivered: false, reason: "send_failed" });
    }

    return json(200, { ok: true, delivered: true });
  } catch (err) {
    console.error("directory-enquiry error", err);
    return json(500, { error: err instanceof Error ? err.message : "Unexpected error" });
  }
});
