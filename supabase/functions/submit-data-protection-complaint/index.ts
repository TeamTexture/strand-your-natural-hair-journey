// DPA 2018 s.164A complaint intake.
//
// Works for signed-out visitors, so the insert happens server-side with the
// service role rather than opening public.data_protection_complaints to anon.
// When a bearer token IS present the owner is derived from the validated token
// only — never from the request body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const norm = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const contactEmail = norm(body.contact_email).slice(0, 254);
    const subject = norm(body.subject).slice(0, 200);
    const details = norm(body.details).slice(0, 5000);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
      return json({ error: "A valid contact email is required." }, 400);
    if (subject.length < 3)
      return json({ error: "Add a short subject for your complaint." }, 400);
    if (details.length < 20)
      return json({ error: "Please describe your complaint in a little more detail." }, 400);

    // Ownership comes from the token when signed in; guests stay anonymous.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { data: claims } = await anon.auth.getClaims(
        authHeader.replace("Bearer ", ""),
      );
      userId = (claims?.claims?.sub as string | undefined) ?? null;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin
      .from("data_protection_complaints")
      .insert({
        user_id: userId,
        contact_email: contactEmail,
        subject,
        details,
        status: "received",
      })
      .select("id, submitted_at")
      .single();

    if (error) return json({ error: error.message }, 400);

    // Confirmation email goes through the single send path (send-app-email).
    // While the global send flag is off it is logged as suppressed, not sent.
    try {
      await admin.functions.invoke("send-app-email", {
        body: {
          templateKey: "complaint-received",
          to: contactEmail,
          recipientUserId: userId,
          triggerEvent: "data_protection_complaint_submitted",
          relatedTable: "data_protection_complaints",
          relatedId: data.id,
          idempotencyKey: `complaint-received-${data.id}`,
          data: { reference: String(data.id).slice(0, 8).toUpperCase() },
        },
      });
    } catch (_e) {
      // Never fail the complaint intake because of email delivery.
    }

    return json({
      ok: true,
      id: data.id,
      submitted_at: data.submitted_at,
      acknowledgement_days: 30,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
