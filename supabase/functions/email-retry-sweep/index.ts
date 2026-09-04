// Re-drives emails that FAILED to transmit.
//
// Before this existed, a send only got the three in-request retries inside
// `transmit()`. When Resend answered 429 daily_quota_exceeded (24 Aug 2026),
// all three burned within a second and the email was lost for good — and the
// idempotency check then treated the failed row as "already sent" so nothing
// could re-drive it.
//
// This sweep picks up `email_log` rows that are `failed`, still under their
// attempt limit, and due (`next_attempt_at <= now()`), and re-dispatches them
// from the render input stored on the row. Backoff between attempts is set by
// the core send path.
//
// Invoked every 15 minutes by pg_cron. Also accepts `{ "ids": [...] }` to
// re-drive specific rows immediately, and `{ "templateKeys": [...] }` to scope
// a manual sweep.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { dispatchEmail, type DispatchInput } from "../_shared/app-email/core.ts";

interface StoredPayload {
  templateKey?: string;
  to?: string | string[];
  recipientUserId?: string | null;
  triggerEvent?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
  idempotencyKey?: string | null;
  data?: Record<string, unknown>;
  from?: string | null;
  replyTo?: string | null;
}

interface LogRow {
  id: string;
  recipient_email: string;
  template_key: string;
  idempotency_key: string | null;
  attempts: number | null;
  max_attempts: number | null;
  payload: StoredPayload | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let body: { ids?: string[]; templateKeys?: string[]; limit?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* cron sends an empty body */
  }
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);

  // Reclaim interrupted sends. A row is written `queued` BEFORE transmission,
  // so a worker killed mid-send (504 during a broadcast burst) leaves it queued
  // forever — and the idempotency check treats any non-failed row as already
  // handled, so nothing could ever re-drive it. Anything still queued after ten
  // minutes never completed.
  if (!body.ids?.length) {
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const { error: reclaimErr, count } = await admin
      .from("email_log")
      .update(
        {
          status: "failed",
          error: "send interrupted before completion",
          next_attempt_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("status", "queued")
      .lt("created_at", cutoff);
    if (reclaimErr) console.error("[email-retry-sweep] reclaim failed", reclaimErr.message);
    else if (count) console.log(`[email-retry-sweep] reclaimed ${count} interrupted send(s)`);
  }

  let query = admin
    .from("email_log")
    .select("id,recipient_email,template_key,idempotency_key,attempts,max_attempts,payload")
    .eq("status", "failed")
    .not("payload", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (body.ids?.length) {
    query = query.in("id", body.ids);
  } else {
    query = query.lte("next_attempt_at", new Date().toISOString());
  }
  if (body.templateKeys?.length) query = query.in("template_key", body.templateKeys);

  const { data, error } = await query;
  if (error) {
    console.error("[email-retry-sweep] query failed", error.message);
    return json({ error: error.message }, 500);
  }

  const rows = (data ?? []) as LogRow[];
  const results: { id: string; template: string; sent: boolean; reason?: string }[] = [];

  for (const row of rows) {
    const p = row.payload ?? {};
    const attempts = row.attempts ?? 0;
    const max = row.max_attempts ?? 4;
    if (!body.ids?.length && attempts >= max) {
      // Out of attempts — stop it being picked up again.
      await admin.from("email_log").update({ next_attempt_at: null }).eq("id", row.id);
      results.push({ id: row.id, template: row.template_key, sent: false, reason: "attempts_exhausted" });
      continue;
    }
    if (!p.templateKey || !p.to) {
      await admin.from("email_log").update({ next_attempt_at: null }).eq("id", row.id);
      results.push({ id: row.id, template: row.template_key, sent: false, reason: "no_payload" });
      continue;
    }

    // The core send path finds this row through its idempotency key and reuses
    // it, so a retry never creates a duplicate log row. Rows written without a
    // key get one now (their own id) so they can be targeted the same way.
    let idempotencyKey = p.idempotencyKey || row.idempotency_key;
    if (!idempotencyKey) {
      idempotencyKey = row.id;
      const { error: keyErr } = await admin
        .from("email_log")
        .update({ idempotency_key: idempotencyKey })
        .eq("id", row.id);
      if (keyErr) {
        results.push({ id: row.id, template: row.template_key, sent: false, reason: "key_write_failed" });
        continue;
      }
    }

    const input: DispatchInput = {
      templateKey: p.templateKey,
      to: p.to,
      recipientUserId: p.recipientUserId ?? null,
      triggerEvent: p.triggerEvent ?? null,
      relatedTable: p.relatedTable ?? null,
      relatedId: p.relatedId ?? null,
      idempotencyKey,
      data: p.data ?? {},
      from: p.from ?? null,
      replyTo: p.replyTo ?? null,
    };

    try {
      const res = await dispatchEmail(input, admin);
      results.push({
        id: row.id,
        template: row.template_key,
        sent: res.sent,
        reason: res.sent ? undefined : res.reason || res.error || "not_sent",
      });
    } catch (e) {
      console.error("[email-retry-sweep] dispatch threw", row.id, e);
      results.push({ id: row.id, template: row.template_key, sent: false, reason: String(e).slice(0, 200) });
    }
  }

  const sent = results.filter((r) => r.sent).length;
  console.log(`[email-retry-sweep] examined ${rows.length}, sent ${sent}`);
  return json({ examined: rows.length, sent, results });
});
