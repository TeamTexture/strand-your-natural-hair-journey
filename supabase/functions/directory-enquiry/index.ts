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
import { dispatchEmail } from "../_shared/app-email/core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    // Composition and transmission go through the single send path so the
    // forward is logged in email_log like every other STRAND email.
    const result = await dispatchEmail(
      {
        templateKey: "directory-enquiry-forwarded",
        to: proEmail,
        replyTo: senderEmail || null,
        triggerEvent: "directory_enquiry.tier_b_forward",
        relatedTable: directoryId ? "professionals_directory" : "pro_profiles",
        relatedId: directoryId ?? proUserId,
        data: { proName, senderName, senderEmail, message, phone },
      },
      admin,
    );

    if (!result.sent) {
      console.warn("directory-enquiry: not delivered", JSON.stringify(result));
      return json(200, {
        ok: true,
        delivered: false,
        reason: result.reason ?? "send_failed",
      });
    }

    return json(200, { ok: true, delivered: true });

  } catch (err) {
    console.error("directory-enquiry error", err);
    return json(500, { error: err instanceof Error ? err.message : "Unexpected error" });
  }
});
