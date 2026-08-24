// Emails a professional when a member sends them an enquiry.
// Fired by a DB trigger on public.pro_enquiries INSERT, so it fires for every
// creation path (directory enquire, salon stylist listings, chat re-enquiry).
// Fire-and-forget: always returns 200 so the insert can never be blocked.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";

const json = (b: unknown) =>
  new Response(JSON.stringify(b), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const human = (v: unknown): string =>
  typeof v === "string" && v.trim()
    ? v.trim().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
    : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { enquiry_id } = await req.json().catch(() => ({}));
    if (typeof enquiry_id !== "string" || !enquiry_id) {
      return json({ ok: false, reason: "missing enquiry_id" });
    }

    const admin = serviceClient();

    const { data: enq } = await admin
      .from("pro_enquiries")
      .select("*")
      .eq("id", enquiry_id)
      .maybeSingle();
    if (!enq) return json({ ok: false, reason: "enquiry_not_found" });
    if (enq.pro_user_id === enq.consumer_id) return json({ ok: true, skipped: "self" });

    // --- Who receives it. The responding login's own profile email first,
    // then the stylist listing / salon business email, then the auth email.
    let proName = "there";
    let recipient: string | null = null;
    let stylistName = "";

    const { data: ownProfile } = await admin
      .from("pro_profiles")
      .select("display_name, contact_email, business_email, salon_id")
      .eq("user_id", enq.pro_user_id)
      .maybeSingle();
    if (ownProfile) {
      proName = ownProfile.display_name ?? proName;
      recipient = ownProfile.contact_email ?? ownProfile.business_email ?? null;
    }

    if (enq.pro_profile_id) {
      const { data: listing } = await admin
        .from("pro_profiles")
        .select("display_name, contact_email, user_id, salon_id")
        .eq("id", enq.pro_profile_id)
        .maybeSingle();
      if (listing) {
        // Only label the stylist when the listing has no login of its own —
        // a solo pro does not need a "for X" line.
        if (listing.user_id === null) stylistName = listing.display_name ?? "";
        if (!recipient) recipient = listing.contact_email ?? null;
        if (!recipient && listing.salon_id) {
          const { data: salon } = await admin
            .from("salons")
            .select("business_email")
            .eq("id", listing.salon_id)
            .maybeSingle();
          recipient = salon?.business_email ?? null;
        }
      }
    }

    if (!recipient) {
      const { data: userRes } = await admin.auth.admin.getUserById(enq.pro_user_id);
      recipient = userRes?.user?.email ?? null;
    }
    if (!recipient) return json({ ok: true, skipped: "no_recipient_email" });

    // --- Who sent it.
    const { data: memberProfile } = await admin
      .from("profiles")
      .select("full_name, display_name")
      .eq("id", enq.consumer_id)
      .maybeSingle();
    const memberName =
      (memberProfile as { full_name?: string | null; display_name?: string | null } | null)
        ?.full_name ||
      (memberProfile as { display_name?: string | null } | null)?.display_name ||
      "A STRAND member";

    const receivedAt = new Date(enq.created_at as string).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    });

    const note = typeof enq.note === "string" ? enq.note.trim().slice(0, 400) : "";

    const result = await dispatchEmail(
      {
        templateKey: "pro-new-enquiry",
        to: recipient,
        recipientUserId: enq.pro_user_id,
        triggerEvent: "pro_enquiry.created",
        relatedTable: "pro_enquiries",
        relatedId: enq.id,
        idempotencyKey: `pro-new-enquiry-${enq.id}`,
        data: {
          name: proName,
          member_name: memberName,
          stylist_name: stylistName,
          note,
          service_interest: human(enq.service_interest),
          preferred_timeframe: human(enq.preferred_timeframe),
          location_preference: human(enq.location_preference),
          budget_range: human(enq.budget_range),
          contact_method: human(enq.contact_method),
          contact_phone: typeof enq.contact_phone === "string" ? enq.contact_phone : "",
          received_at: receivedAt,
          share_passport_consent: enq.share_passport_consent === true,
        },
      },
      admin,
    );

    if (!result.sent) console.warn("notify-pro-enquiry not sent", JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("notify-pro-enquiry error", err);
    return json({ ok: false, error: String(err) });
  }
});
