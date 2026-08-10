// THE ONLY SCHEDULED EMAIL ENTRY POINT for treatment plans.
// pg_cron calls this hourly and carries no logic of its own — everything about
// what is due is decided here. Two send types only: the client weekly check-in
// nudge and the professional/admin weekly digest. There is deliberately no
// daily email. The invitation sweep is a safety net for assignments whose
// immediate email never went out; idempotency keys make it a no-op otherwise.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import { sendPlanInvitation } from "../_shared/app-email/treatment-invite.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Nudges go out on the evening the plan week ends, and any hour after. */
const NUDGE_FROM_HOUR = 17;
/** Digest goes out on Monday mornings, covering the week just finished. */
const DIGEST_DOW = 1;
const DIGEST_FROM_HOUR = 8;

const iso = (d: Date) => d.toISOString().slice(0, 10);

function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("TREATMENT_CRON_KEY") ?? "";
  if (!key || req.headers.get("x-cron-key") !== key) {
    return json({ error: "Unauthorized" }, 401);
  }

  // `force` runs both send types outside their normal window. Idempotency keys
  // mean it can never duplicate a send — used for verification only.
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch { /* no body */ }

  const admin = serviceClient();
  const now = new Date();
  const hour = now.getUTCHours();
  const today = iso(now);

  const out: Record<string, unknown> = { ran_at: now.toISOString() };

  try {
    // Treatment plans are STRAND+ only. A lapsed member's plan goes read-only
    // (status 'paused'); nothing they recorded is ever removed.
    const { data: paused, error: pErr } = await admin.rpc("pause_lapsed_treatment_plans");
    out.paused_lapsed = pErr ? { error: pErr.message } : { plans: Number(paused ?? 0) };
  } catch (e) {
    out.paused_lapsed_error = String(e);
  }

  try {
    out.invitations = await sweepInvitations(admin);
  } catch (e) {
    out.invitations_error = String(e);
  }

  try {
    out.nudges =
      force || hour >= NUDGE_FROM_HOUR ? await sendNudges(admin, today) : { skipped: "outside_window" };
  } catch (e) {
    out.nudges_error = String(e);
  }

  try {
    out.digests =
      force || (now.getUTCDay() === DIGEST_DOW && hour >= DIGEST_FROM_HOUR)
        ? await sendDigests(admin, now)
        : { skipped: "outside_window" };
  } catch (e) {
    out.digests_error = String(e);
  }

  return json({ ok: true, ...out });
});

/* ----------------------------------------------- invitation safety net ---- */

async function sweepInvitations(admin: SupabaseClient) {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: rows } = await admin
    .from("treatment_plan_assignments")
    .select("id")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(200);

  let sent = 0;
  let deduped = 0;
  for (const r of rows ?? []) {
    const res = await sendPlanInvitation(admin, String(r.id));
    if (res.sent) sent += 1;
    else if (res.deduped) deduped += 1;
  }
  return { candidates: rows?.length ?? 0, sent, deduped };
}

/* -------------------------------------------- client weekly check-in ------ */

async function sendNudges(admin: SupabaseClient, today: string) {
  // Each plan carries its own cadence (daily / weekly on a chosen day) and hour
  // in the member's timezone. This runs hourly and only picks the plans whose
  // chosen slot is the current local hour.
  const { data: due, error } = await admin.rpc("treatment_reminders_due", {
    _now: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  for (const row of (due ?? []) as Array<Record<string, unknown>>) {
    const userId = String(row.user_id);
    // No nudge to a member who can no longer log anything.
    const { data: plus } = await admin.rpc("has_active_plus_subscription", { _user: userId });
    if (plus !== true) {
      skipped += 1;
      continue;
    }
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!email) {
      skipped += 1;
      continue;
    }
    const { data: pr } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const daily = String(row.frequency) === "daily";
    const slot = daily ? String(row.local_date) : `w${row.week_number}`;
    const tasks = Array.isArray(row.due_tasks) ? (row.due_tasks as string[]) : [];
    // A daily reminder names today's steps; the weekly one asks for the check-in.
    const templateKey = daily ? "treatment-daily-reminder" : "treatment-checkin-nudge";

    const res = await dispatchEmail(
      {
        templateKey,
        to: email,
        recipientUserId: userId,
        triggerEvent: "treatment_plan.reminder",
        relatedTable: "treatment_plans",
        relatedId: String(row.plan_id),
        // One key per plan per slot — a retry or overlapping run cannot double send.
        idempotencyKey: `${templateKey}:${row.plan_id}:${slot}`,

        data: {
          name: pr?.display_name ? String(pr.display_name).split(" ")[0] : "there",
          plan_id: String(row.plan_id),
          plan_title: row.plan_title ?? "your plan",
          week: row.week_number,
          steps_logged: Number(row.steps_logged ?? 0),
          due_tasks: tasks,
          due_outstanding: Number(row.due_outstanding ?? 0),
        },
      },
      admin,
    );
    if (res.sent) sent += 1;
    else skipped += 1;
  }
  return { due: due?.length ?? 0, sent, skipped };
}

/* ------------------------------- professional / admin weekly digest ------ */

async function sendDigests(admin: SupabaseClient, now: Date) {
  // The week just finished: last Monday to last Sunday.
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() || 7) - 1) - 1); // yesterday-ish Sunday
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const weekKey = isoWeekKey(start);

  const { data: recipients, error } = await admin.rpc("treatment_digest_recipients");
  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  for (const r of (recipients ?? []) as Array<Record<string, unknown>>) {
    const userId = String(r.user_id);
    const isAdmin = r.is_admin === true;

    // Built per recipient with the same access rules as the app — never a
    // blanket query. Names only where the recipient has accepted access.
    const { data: digest, error: dErr } = await admin.rpc("treatment_digest_for_recipient", {
      _recipient: userId,
      _week_start: iso(start),
      _week_end: iso(end),
    });
    if (dErr) {
      skipped += 1;
      continue;
    }
    const d = (digest ?? {}) as {
      clients_total?: number;
      checked_in?: Array<{ name?: string }>;
      quiet?: Array<{ name?: string; days?: number | null }>;
    };
    const total = Number(d.clients_total ?? 0);
    const checked = (d.checked_in ?? []).map((x) => String(x?.name ?? "A member"));
    const quiet = (d.quiet ?? []).map((x) => {
      const name = String(x?.name ?? "A member");
      const days = x?.days;
      return typeof days === "number"
        ? `${name} (${days} day${days === 1 ? "" : "s"} since their last entry)`
        : `${name} (no entries yet)`;
    });

    // Nothing to say — don't send.
    if (total === 0 && checked.length === 0 && quiet.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!email) {
      skipped += 1;
      continue;
    }
    const { data: pr } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const res = await dispatchEmail(
      {
        templateKey: "treatment-weekly-digest",
        to: email,
        recipientUserId: userId,
        triggerEvent: "treatment_plans.weekly_digest",
        idempotencyKey: `treatment-weekly-digest:${userId}:${weekKey}`,
        data: {
          name: pr?.display_name ? String(pr.display_name).split(" ")[0] : "there",
          clients_total: total,
          checked_in: checked,
          quiet,
          path: isAdmin ? "/admin/treatment" : "/pro/treatment",
        },
      },
      admin,
    );
    if (res.sent) sent += 1;
    else skipped += 1;
  }
  return { week: weekKey, recipients: recipients?.length ?? 0, sent, skipped };
}
