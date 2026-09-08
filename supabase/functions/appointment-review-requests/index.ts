// THE post-appointment review request. Scheduled (pg_cron, hourly).
//
// Why this exists: reviews were only ever asked for passively — a card inside a
// past appointment on /appointments. A member who never reopened that screen was
// never asked, so completed appointments with STRAND professionals went
// unreviewed. This is the active half: one in-app notification plus one email,
// sent ONCE per appointment.
//
// Eligibility (all must hold):
//   - status = 'completed' (the "did this happen?" dialog is what sets it)
//   - linked_pro_user_id is present (a review is keyed to a STRAND professional)
//   - the appointment date has passed by at least DELAY_HOURS
//   - review_request_sent_at is null (the idempotency guard)
//   - no review row already exists for the appointment
//
// The email respects the member's `appointment_reminders` preference through the
// single dispatch path; the in-app notification always goes in. A failed email
// never blocks the notification, and the stamp is written either way so nothing
// is ever asked twice.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Give the visit itself time to finish before asking how it went. */
const DELAY_HOURS = 20;
/** Past this, asking is stale — the row is stamped and left alone. */
const MAX_AGE_DAYS = 45;
const BATCH = 100;

const friendlyDate = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("TREATMENT_CRON_KEY") ?? "";
  if (!key || req.headers.get("x-cron-key") !== key) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = serviceClient();
  const now = new Date();
  const cutoff = new Date(now.getTime() - DELAY_HOURS * 3600_000);
  const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 86400_000);

  const out = {
    ran_at: now.toISOString(),
    considered: 0,
    notified: 0,
    emailed: 0,
    skipped_existing_review: 0,
    stale: 0,
    errors: [] as string[],
  };

  try {
    const { data: rows, error } = await admin
      .from("appointments")
      .select(
        "id, user_id, professional_name, linked_pro_user_id, appointment_date, service, reason",
      )
      .eq("status", "completed")
      .not("linked_pro_user_id", "is", null)
      .is("review_request_sent_at", null)
      .lte("appointment_date", cutoff.toISOString().slice(0, 10))
      .order("appointment_date", { ascending: false })
      .limit(BATCH);
    if (error) throw error;

    const list = rows ?? [];
    out.considered = list.length;
    if (list.length === 0) return json(out);

    // Anything already reviewed is stamped, never asked.
    const { data: existing } = await admin
      .from("reviews")
      .select("appointment_id")
      .in("appointment_id", list.map((r) => r.id));
    const reviewed = new Set(
      (existing ?? [])
        .map((r) => (r as { appointment_id: string | null }).appointment_id)
        .filter((v): v is string => !!v),
    );

    const stamp = async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error: sErr } = await admin
        .from("appointments")
        .update({ review_request_sent_at: new Date().toISOString() })
        .in("id", ids);
      if (sErr) out.errors.push(`stamp: ${sErr.message}`);
    };

    const skip: string[] = [];
    const due: typeof list = [];
    for (const r of list) {
      if (reviewed.has(r.id)) {
        out.skipped_existing_review++;
        skip.push(r.id);
      } else if (new Date(`${r.appointment_date}T00:00:00Z`) < oldest) {
        out.stale++;
        skip.push(r.id);
      } else {
        due.push(r);
      }
    }
    await stamp(skip);
    if (due.length === 0) return json(out);

    // Recipients' names and emails in one round trip.
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, first_name, email")
      .in("user_id", due.map((r) => r.user_id));
    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        (p as { user_id: string }).user_id,
        p as { first_name: string | null; email: string | null },
      ]),
    );

    for (const r of due) {
      const proName = (r.professional_name ?? "").trim() || "your professional";
      const reviewPath = `/reviews/new?appointmentId=${r.id}`;

      const { error: nErr } = await admin.from("notifications").insert({
        user_id: r.user_id,
        kind: "appointment_review",
        title: `How was your appointment with ${proName}?`,
        body: "Leave them a review — it takes a minute and helps other members choose.",
        url: reviewPath,
        entity_type: "appointment",
        entity_id: r.id,
        actor_id: r.linked_pro_user_id,
      });
      if (nErr) out.errors.push(`notify ${r.id}: ${nErr.message}`);
      else out.notified++;

      const p = profileMap.get(r.user_id);
      if (p?.email) {
        try {
          const res = await dispatchEmail({
            templateKey: "appointment-review-request",
            to: p.email,
            recipientUserId: r.user_id,
            triggerEvent: "appointment_review_request",
            relatedTable: "appointments",
            relatedId: r.id,
            idempotencyKey: `appointment-review-request:${r.id}`,
            data: {
              name: p.first_name ?? "",
              pro_name: proName,
              when: friendlyDate(r.appointment_date),
              review_path: reviewPath,
            },
          });
          if (res.sent) out.emailed++;
        } catch (e) {
          out.errors.push(`email ${r.id}: ${(e as Error).message}`);
        }
      }

      await stamp([r.id]);
    }

    return json(out);
  } catch (e) {
    out.errors.push((e as Error).message);
    return json(out, 500);
  }
});
