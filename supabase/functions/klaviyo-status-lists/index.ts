// Backfills and the daily job for the two state-driven Klaviyo lists.
//
// Modes:
//   { mode: "paywall-backfill" }   admin/service — everyone who matches the
//                                  STRAND_PAYWALL_LIST definition today.
//   { mode: "abandoned-backfill" } admin/service — everyone who matches the
//                                  STRAND_ABANDONED_LIST definition today.
//   { mode: "abandoned-daily" }    the scheduled run (pg_cron). Takes no input,
//                                  enumerates eligible members itself and is
//                                  idempotent, so it is safe to trigger.
//
// Every mode skips anyone already pushed successfully to that list (read from
// klaviyo_sync_log) and anyone without email_preferences.marketing_consent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { requireAdminOrService } from "../_shared/auth.ts";
import {
  KLAVIYO_ABANDONED_24H_LIST_ID,
  KLAVIYO_PAYWALL_STATUS_LIST_ID,
  PAYWALL_STATUSES,
  alreadySynced,
  syncAbandonedMember,
  syncPaywallStatusMember,
} from "../_shared/klaviyo-status-lists.ts";

const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

// deno-lint-ignore no-explicit-any
type Admin = any;

async function runPaywall(admin: Admin, action: "paywall_backfill") {
  const { data } = await admin
    .from("consumer_subscriptions")
    .select("user_id, status, stripe_subscription_id")
    .not("stripe_subscription_id", "is", null)
    .in("status", PAYWALL_STATUSES as unknown as string[]);
  const rows = (data ?? []) as { user_id: string; status: string }[];
  const done = await alreadySynced(admin, KLAVIYO_PAYWALL_STATUS_LIST_ID, [
    action,
    "paywall_list_webhook",
  ]);

  let pushed = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    if (done.has(r.user_id)) { skipped += 1; continue; }
    const outcome = await syncPaywallStatusMember(admin, r.user_id, action, r.status);
    if (outcome === "pushed") pushed += 1;
    else if (outcome === "failed") failed += 1;
    else skipped += 1;
  }
  return { list: KLAVIYO_PAYWALL_STATUS_LIST_ID, considered: rows.length, pushed, skipped, failed };
}

async function runAbandoned(
  admin: Admin,
  action: "abandoned_backfill" | "abandoned_list_webhook",
) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: profiles }, { data: subs }] = await Promise.all([
    admin.from("profiles")
      .select("user_id, trial_offer_at")
      .not("trial_offer_at", "is", null)
      .lt("trial_offer_at", cutoff),
    admin.from("consumer_subscriptions").select("user_id"),
  ]);
  const hasSub = new Set(
    ((subs ?? []) as { user_id: string }[]).map((s) => s.user_id),
  );
  const rows = ((profiles ?? []) as { user_id: string; trial_offer_at: string }[])
    .filter((p) => !hasSub.has(p.user_id));
  const done = await alreadySynced(admin, KLAVIYO_ABANDONED_24H_LIST_ID, [
    "abandoned_backfill",
    "abandoned_list_webhook",
  ]);

  let pushed = 0, skipped = 0, failed = 0;
  for (const p of rows) {
    if (done.has(p.user_id)) { skipped += 1; continue; }
    const outcome = await syncAbandonedMember(admin, p.user_id, action, p.trial_offer_at);
    if (outcome === "pushed") pushed += 1;
    else if (outcome === "failed") failed += 1;
    else skipped += 1;
  }
  return { list: KLAVIYO_ABANDONED_24H_LIST_ID, considered: rows.length, pushed, skipped, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let mode = "";
  try {
    const body = await req.json() as { mode?: unknown } | null;
    if (typeof body?.mode === "string") mode = body.mode;
  } catch (_e) { /* no body */ }

  const admin = adminClient();

  if (mode === "abandoned-daily") {
    const result = await runAbandoned(admin, "abandoned_list_webhook");
    console.log("[klaviyo-status-lists] abandoned daily", result);
    return json(200, result);
  }

  const gate = await requireAdminOrService(req);
  if (gate instanceof Response) return gate;

  if (mode === "paywall-backfill") {
    const result = await runPaywall(admin, "paywall_backfill");
    console.log("[klaviyo-status-lists] paywall backfill", result);
    return json(200, result);
  }
  if (mode === "abandoned-backfill") {
    const result = await runAbandoned(admin, "abandoned_backfill");
    console.log("[klaviyo-status-lists] abandoned backfill", result);
    return json(200, result);
  }
  return json(400, { error: "Unknown mode" });
});
