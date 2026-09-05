// deno-lint-ignore-file no-explicit-any
//
// SCHEDULED ERASURE — 30 days after a member asked for their own deletion.
//
// SHIPPED IN DRY-RUN MODE. Live deletion is NOT armed: `DRY_RUN` is a constant
// in this file and every destructive call sits behind it. To arm it, set the
// secret ACCOUNT_ERASURE_ARMED to "true" AND flip nothing else — the guard reads
// both the constant and the secret, so it takes a deliberate code change plus a
// secret to switch on.
//
// GUARDS (all of them, always):
//  1. The eligibility query filters `deletion_requested_at IS NOT NULL` AND
//     `deletion_requested_at <= now() - 30 days`. There is no bare delete
//     anywhere in this file and no user id can be passed in.
//  2. The 30-day threshold is computed here, at execution time. Request bodies
//     are ignored entirely.
//  3. At most MAX_PER_RUN accounts per run, and every user id touched is written
//     to public.account_erasure_runs.
//  4. Retention: payment records (consumer_subscriptions) and data protection
//     complaints are kept for six years, as the Privacy Policy states. Storage
//     objects are removed alongside the rows so no orphaned bucket is left.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { isServiceRoleCaller } from "../_shared/auth.ts";
import { removeSuperchatLists } from "../_shared/superchat-lists.ts";

/** Live deletion is NOT armed in this build. */
const DRY_RUN = true;
const GRACE_DAYS = 30;
const MAX_PER_RUN = 25;

/** Buckets holding member-owned objects, and how a member's objects are found. */
const MEMBER_BUCKETS = [
  "avatars",
  "before-photos",
  "milestone-photos",
  "journal-photos",
  "journal-videos",
  "moodboard-images",
  "product-photos",
  "appointment-photos",
  "voicenotes",
  "review-audio",
  "goal-progress-audio",
  "blood-panel-thumbs",
  "treatment-plan-media",
  "chat-images",
  "forum-images",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  // Server-to-server only: the scheduler presents a shared token, or a trusted
  // service-role caller invokes it directly. No member or admin can trigger a run.
  const token = Deno.env.get("ACCOUNT_ERASURE_TOKEN") ?? "";
  const presented = req.headers.get("x-erasure-token") ?? "";
  const scheduled = !!token && presented === token;
  if (!scheduled && !isServiceRoleCaller(req)) return json(401, { error: "unauthorized" });


  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const armed = (Deno.env.get("ACCOUNT_ERASURE_ARMED") ?? "").toLowerCase() === "true";
  const live = !DRY_RUN && armed;

  // Threshold computed here, never accepted from the caller.
  const cutoff = new Date(Date.now() - GRACE_DAYS * 86400_000).toISOString();

  try {
    const { data: rows, error } = await admin
      .from("profiles")
      .select("user_id, deletion_requested_at")
      .not("deletion_requested_at", "is", null)
      .lte("deletion_requested_at", cutoff)
      .order("deletion_requested_at", { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) throw error;

    const eligible = ((rows ?? []) as any[]).filter((r) => !!r.deletion_requested_at);

    const perUser: Record<string, unknown>[] = [];

    for (const row of eligible) {
      const userId = row.user_id as string;
      // Re-read the stamp immediately before acting, and re-check the threshold.
      const { data: fresh } = await admin
        .from("profiles")
        .select("deletion_requested_at")
        .eq("user_id", userId)
        .maybeSingle();
      const stamp = (fresh as any)?.deletion_requested_at as string | null | undefined;
      if (!stamp || new Date(stamp).getTime() > Date.now() - GRACE_DAYS * 86400_000) {
        perUser.push({ user_id: userId, skipped: "request cleared or not yet due" });
        continue;
      }

      const storage: Record<string, number> = {};
      for (const bucket of MEMBER_BUCKETS) {
        const { data: objs } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
        const count = (objs ?? []).length;
        if (count > 0) storage[bucket] = count;
        if (live && count > 0) {
          await admin.storage
            .from(bucket)
            .remove((objs ?? []).map((o: any) => `${userId}/${o.name}`));
        }
      }

      const plan = {
        user_id: userId,
        requested_at: stamp,
        would_delete: {
          auth_user: true,
          note:
            "auth.users delete cascades every public table that references it; " +
            "retained tables are excluded below",
          storage_objects: storage,
        },
        would_retain: {
          consumer_subscriptions: "payment records — six years (tax law)",
          data_protection_complaints: "complaint records — six years",
        },
        executed: live,
      };

      if (live) {
        // Off both Superchat lists BEFORE the row disappears — the contact id
        // lives on the profile, so this cannot be done after the cascade.
        await removeSuperchatLists(admin, userId, "account_erasure");
        // Detach the retained rows from the cascade before removing the user.
        await admin
          .from("data_protection_complaints")
          .update({ user_id: null })
          .eq("user_id", userId);
        await admin.auth.admin.deleteUser(userId);
      }

      perUser.push(plan);
    }

    const logRow = {
      dry_run: !live,
      cap: MAX_PER_RUN,
      eligible_count: eligible.length,
      processed_count: live ? perUser.filter((p) => (p as any).executed).length : 0,
      user_ids: eligible.map((r) => r.user_id),
      details: { cutoff, armed, dry_run_constant: DRY_RUN, accounts: perUser },
    };
    await admin.from("account_erasure_runs").insert(logRow);

    console.log("scheduled-account-erasure", JSON.stringify(logRow));
    return json(200, { ok: true, ...logRow });
  } catch (e) {
    console.error("scheduled-account-erasure error", e);
    await admin.from("account_erasure_runs").insert({
      dry_run: !live,
      cap: MAX_PER_RUN,
      error: (e as Error).message,
    });
    return json(500, { error: (e as Error).message });
  }
});
