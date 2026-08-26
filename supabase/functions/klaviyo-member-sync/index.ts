// Keeps the STRAND member (consumer) Klaviyo list in step with the app.
//
// Two modes:
//   { mode: "self" }     — the signed-in account adds itself (called after
//                          registration and after personal details are saved).
//   { mode: "backfill" } — admin only: walks every account and subscribes every
//                          STRAND end user. Idempotent (Klaviyo upserts).
//
// Never included: professionals, brands, admins, international-blocked accounts
// and accounts that asked to be deleted.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser, requireAdminOrService } from "../_shared/auth.ts";
import {
  pushToKlaviyoList,
  addToKlaviyoList,
  logKlaviyoSync,
  KLAVIYO_MEMBER_LIST_ID,
  KLAVIYO_PAID_MEMBER_LIST_ID,
} from "../_shared/klaviyo.ts";
import { addToPaywallList, removeFromPaywallList } from "../_shared/klaviyo-nurture.ts";

interface Candidate {
  userId: string;
  email: string;
  name: string | null;
  phone: string | null;
}

const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

/** Accounts that carry any non-consumer role are staff/partners, never members. */
async function nonMemberIds(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["professional", "brand", "admin"]);
  return new Set((data ?? []).map((r) => r.user_id as string));
}

async function pushMember(c: Candidate, extra: Record<string, string> = {}) {
  return await pushToKlaviyoList({
    listId: KLAVIYO_MEMBER_LIST_ID,
    email: c.email,
    name: c.name,
    phone: c.phone,
    properties: { strand_account_type: "member", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  let mode = "self";
  try {
    const body = await req.json() as { mode?: unknown } | null;
    if (body?.mode === "backfill") mode = "backfill";
    if (body?.mode === "paid-backfill") mode = "paid-backfill";
    if (body?.mode === "consent") mode = "consent";
  } catch (_e) { /* default mode */ }

  const admin = adminClient();

  if (mode === "self") {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const [{ data: profile }, blocked] = await Promise.all([
      admin
        .from("profiles")
        .select("display_name, phone_number, international_block, deletion_requested_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      nonMemberIds(admin),
    ]);

    if (blocked.has(user.id)) return json(200, { skipped: "not a member account" });
    if (profile?.international_block) return json(200, { skipped: "international block" });
    if (profile?.deletion_requested_at) return json(200, { skipped: "deletion requested" });

    const email = (user.email ?? "").toLowerCase();
    if (!email) return json(200, { skipped: "no email" });

    const error = await pushMember({
      userId: user.id,
      email,
      name: profile?.display_name ??
        (user.user_metadata as { display_name?: string } | null)?.display_name ?? null,
      phone: profile?.phone_number ? String(profile.phone_number) : null,
    });
    if (error) {
      console.error("[klaviyo-member-sync] self push failed", { user_id: user.id, error });
      return json(200, { added: false, error });
    }
    return json(200, { added: true, list: KLAVIYO_MEMBER_LIST_ID });
  }

  // ---- consent sync for the signed-in member ----
  // Called when she answers the /home offers card or flips the Profile toggle.
  // Adds her to the paid list and sets marketing consent ONLY on an explicit yes.
  if (mode === "consent") {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const [{ data: profile }, { data: sub }] = await Promise.all([
      admin
        .from("profiles")
        .select("display_name, phone_number, personalised_offers_consent, international_block, deletion_requested_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("consumer_subscriptions")
        .select("status, tier, trial_end")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (profile?.international_block) return json(200, { skipped: "international block" });
    if (profile?.deletion_requested_at) return json(200, { skipped: "deletion requested" });

    const email = (user.email ?? "").toLowerCase();
    if (!email) return json(200, { skipped: "no email" });
    const status = (sub?.status as string | null) ?? "none";

    const error = await addToKlaviyoList({
      listId: KLAVIYO_PAID_MEMBER_LIST_ID,
      email,
      name: (profile?.display_name as string | null) ?? null,
      phone: profile?.phone_number ? String(profile.phone_number) : null,
      marketingConsent: profile?.personalised_offers_consent === true,
      properties: {
        strand_account_type: "member",
        strand_status: status,
        strand_tier: (sub?.tier as string | null) ?? "standard",
        strand_offers_consent: profile?.personalised_offers_consent === true ? "true" : "false",
        ...(sub?.trial_end ? { strand_trial_end: String(sub.trial_end) } : {}),
      },
    });
    await logKlaviyoSync(admin, {
      email,
      user_id: user.id,
      list_id: KLAVIYO_PAID_MEMBER_LIST_ID,
      action: "consent_sync",
      ok: !error,
      error,
      context: { consent: profile?.personalised_offers_consent === true, status },
    });

    // Consent gate on the PAYWALL nurture list (a marketing list): a yes adds
    // her, a no takes her off. The abandoned-checkout list is untouched here —
    // it is a service message about an action she started, so it deliberately
    // ignores this flag.
    if (profile?.personalised_offers_consent === true) {
      await addToPaywallList(admin, user.id);
    } else {
      await removeFromPaywallList(admin, email, user.id, "offers_consent_false");
    }

    if (error) {
      console.error("[klaviyo-member-sync] consent sync failed", { user_id: user.id, error });
      return json(200, { synced: false, error });
    }
    return json(200, { synced: true, list: KLAVIYO_PAID_MEMBER_LIST_ID });
  }

  // ---- paid-members backfill (admin only) ----
  if (mode === "paid-backfill") {
    const paidGate = await requireAdminOrService(req);
    if (paidGate instanceof Response) return paidGate;

    const { data: subs } = await admin
      .from("consumer_subscriptions")
      .select("user_id, status, tier, trial_end")
      .in("status", ["active", "trialing"]);
    const rows = subs ?? [];

    let added = 0;
    const failures: { user_id: string; error: string }[] = [];
    for (const s of rows) {
      const userId = s.user_id as string;
      const [{ data: prof }, { data: authUser }] = await Promise.all([
        admin.from("profiles")
          .select("display_name, phone_number, personalised_offers_consent")
          .eq("user_id", userId)
          .maybeSingle(),
        admin.auth.admin.getUserById(userId),
      ]);
      const email = (authUser?.user?.email ?? "").toLowerCase();
      if (!email) { failures.push({ user_id: userId, error: "no email" }); continue; }
      // Audit accounts are internal test users and must never reach Klaviyo.
      if (/^audit\..*@teamtexture\.co\.uk$/.test(email)) continue;
      const error = await addToKlaviyoList({
        listId: KLAVIYO_PAID_MEMBER_LIST_ID,
        email,
        name: (prof as { display_name?: string | null } | null)?.display_name ?? null,
        phone: (prof as { phone_number?: unknown } | null)?.phone_number
          ? String((prof as { phone_number?: unknown }).phone_number)
          : null,
        marketingConsent:
          (prof as { personalised_offers_consent?: boolean | null } | null)
            ?.personalised_offers_consent === true,
        properties: {
          strand_account_type: "member",
          strand_paid: "true",
          strand_tier: (s.tier as string | null) ?? "standard",
          strand_status: (s.status as string | null) ?? "active",
          ...(s.trial_end ? { strand_trial_end: String(s.trial_end) } : {}),
        },
      });
      await logKlaviyoSync(admin, {
        email,
        user_id: userId,
        list_id: KLAVIYO_PAID_MEMBER_LIST_ID,
        action: "paid_backfill",
        ok: !error,
        error,
        context: { status: s.status, tier: s.tier },
      });
      if (error) failures.push({ user_id: userId, error });
      else added += 1;
    }

    console.log("[klaviyo-member-sync] paid backfill", {
      considered: rows.length, added, failed: failures.length,
    });
    return json(200, {
      list: KLAVIYO_PAID_MEMBER_LIST_ID,
      considered: rows.length,
      added,
      failed: failures.length,
      failures: failures.slice(0, 20),
    });
  }

  // ---- backfill (admin only) ----
  const gate = await requireAdminOrService(req);
  if (gate instanceof Response) return gate;

  const excluded = await nonMemberIds(admin);
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, display_name, phone_number, international_block, deletion_requested_at");
  const byUser = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p as Record<string, unknown>]),
  );

  const candidates: Candidate[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json(500, { error: error.message });
    const users = data?.users ?? [];
    for (const u of users) {
      const email = (u.email ?? "").toLowerCase();
      if (!email) continue;
      if (excluded.has(u.id)) continue;
      const p = byUser.get(u.id);
      if (!p) continue; // no member profile = not a STRAND end user
      if (p.international_block) continue;
      if (p.deletion_requested_at) continue;
      candidates.push({
        userId: u.id,
        email,
        name: (p.display_name as string | null) ?? null,
        phone: p.phone_number ? String(p.phone_number) : null,
      });
    }
    if (users.length < 200) break;
  }

  let added = 0;
  const failures: { email: string; error: string }[] = [];
  for (const c of candidates) {
    const error = await pushMember(c, { strand_status: "backfill" });
    if (error) failures.push({ email: c.email, error });
    else added += 1;
  }

  console.log("[klaviyo-member-sync] backfill", {
    considered: candidates.length,
    added,
    failed: failures.length,
  });
  return json(200, {
    list: KLAVIYO_MEMBER_LIST_ID,
    considered: candidates.length,
    added,
    failed: failures.length,
    failures: failures.slice(0, 20),
  });
});
