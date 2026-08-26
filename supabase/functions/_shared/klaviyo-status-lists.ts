// Two STATE-DRIVEN Klaviyo lists, mirroring the paid-list sync pattern exactly
// (same helper, same klaviyo_sync_log logging, same consent gate).
//
//   STRAND_PAYWALL_LIST   (XcgcdA)
//     she started checkout — consumer_subscriptions row WITH a
//     stripe_subscription_id — but the subscription is not active/trialing
//     (incomplete, incomplete_expired, canceled, past_due).
//
//   STRAND_ABANDONED_LIST (WzQpDj)
//     she reached /start-trial (profiles.trial_offer_at) more than 24 hours ago
//     and has NO consumer_subscriptions row at all.
//
// CONSENT: both lists are marketing, so both require
// profiles.personalised_offers_consent = true (same gate as the paid list).
// Not true → skip.
// A push never sets or changes anyone's Klaviyo consent.
//
// Every push is wrapped so a Klaviyo failure can never break a webhook, a cron
// run or a backfill. Outcomes land in public.klaviyo_sync_log.

import { addToKlaviyoList, logKlaviyoSync } from "./klaviyo.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Env override kept for parity with the paid list; ids supplied by Paige. */
export const KLAVIYO_PAYWALL_STATUS_LIST_ID =
  Deno.env.get("KLAVIYO_PAYWALL_STATUS_LIST_ID") || "XcgcdA";
export const KLAVIYO_ABANDONED_24H_LIST_ID =
  Deno.env.get("KLAVIYO_ABANDONED_24H_LIST_ID") || "WzQpDj";

/** Subscription statuses that mean "started checkout, not paying". */
export const PAYWALL_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "canceled",
  "past_due",
] as const;

export interface StatusMember {
  userId: string;
  email: string;
  name: string | null;
  phone: string | null;
}

/** Loads the member and applies every skip rule. Returns null when we must not push. */
export async function loadStatusMember(
  admin: Admin,
  userId: string,
): Promise<StatusMember | null> {
  const [profileRes, authRes] = await Promise.all([
    admin.from("profiles")
      .select("display_name, phone_number, international_block, deletion_requested_at, personalised_offers_consent")
      .eq("user_id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  const profile = profileRes.data as Record<string, unknown> | null;
  if (profile?.international_block || profile?.deletion_requested_at) return null;
  if (profile?.personalised_offers_consent !== true) return null;

  const email = String(authRes?.data?.user?.email ?? "").toLowerCase();
  if (!email) return null;
  // Internal audit accounts must never reach Klaviyo.
  if (/^audit\..*@teamtexture\.co\.uk$/.test(email)) return null;

  return {
    userId,
    email,
    name: (profile?.display_name as string | null) ?? null,
    phone: profile?.phone_number ? String(profile.phone_number) : null,
  };
}

async function push(
  admin: Admin,
  userId: string,
  listId: string,
  action: string,
  properties: Record<string, string>,
  context: Record<string, unknown>,
): Promise<"pushed" | "skipped" | "failed"> {
  try {
    const m = await loadStatusMember(admin, userId);
    if (!m) return "skipped";
    const error = await addToKlaviyoList({
      listId,
      email: m.email,
      name: m.name,
      phone: m.phone,
      // Membership only — never set consent as a side effect.
      marketingConsent: null,
      properties: { strand_account_type: "member", ...properties },
    });
    if (error) console.error(`[klaviyo-status-lists] ${action} failed`, error);
    await logKlaviyoSync(admin, {
      email: m.email,
      user_id: userId,
      list_id: listId,
      action,
      ok: !error,
      error,
      context,
    });
    return error ? "failed" : "pushed";
  } catch (e) {
    console.error(`[klaviyo-status-lists] ${action} threw`, e);
    await logKlaviyoSync(admin, {
      user_id: userId,
      list_id: listId,
      action,
      ok: false,
      error: e instanceof Error ? e.message : "threw",
      context,
    });
    return "failed";
  }
}

/** STRAND_PAYWALL_LIST sync. `action` distinguishes webhook from backfill. */
export function syncPaywallStatusMember(
  admin: Admin,
  userId: string,
  action: "paywall_list_webhook" | "paywall_backfill",
  status: string,
): Promise<"pushed" | "skipped" | "failed"> {
  return push(
    admin,
    userId,
    KLAVIYO_PAYWALL_STATUS_LIST_ID,
    action,
    { strand_stage: "checkout_not_paying", strand_status: status },
    { status },
  );
}

/** STRAND_ABANDONED_LIST sync. `action` distinguishes daily job from backfill. */
export function syncAbandonedMember(
  admin: Admin,
  userId: string,
  action: "abandoned_list_webhook" | "abandoned_backfill",
  trialOfferAt: string | null,
): Promise<"pushed" | "skipped" | "failed"> {
  return push(
    admin,
    userId,
    KLAVIYO_ABANDONED_24H_LIST_ID,
    action,
    {
      strand_stage: "never_started_checkout",
      ...(trialOfferAt ? { strand_trial_offer_at: trialOfferAt } : {}),
    },
    { trial_offer_at: trialOfferAt },
  );
}

/**
 * User ids already pushed to a list, read from klaviyo_sync_log, so nobody is
 * ever added twice (the daily job would otherwise re-add every day).
 */
export async function alreadySynced(
  admin: Admin,
  listId: string,
  actions: string[],
): Promise<Set<string>> {
  const { data } = await admin
    .from("klaviyo_sync_log")
    .select("user_id")
    .eq("list_id", listId)
    .in("action", actions)
    .eq("ok", true);
  return new Set(
    ((data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id)
      .filter((id): id is string => !!id),
  );
}
