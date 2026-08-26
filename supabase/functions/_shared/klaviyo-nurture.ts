// Klaviyo NURTURE lists — two automations, driven entirely from app state.
//
//   LIST 1  "STRAND — Reached Paywall, No Checkout"  (KLAVIYO_PAYWALL_LIST_ID)
//     added   when profiles.trial_offer_at is stamped at sign-up and there is no
//             active/trialing subscription
//     removed when she opens a checkout session (she moves to list 2), when she
//             converts, or when personalised-offers consent flips to false
//
//   LIST 2  "STRAND — Abandoned Checkout"            (KLAVIYO_ABANDONED_LIST_ID)
//     added   the moment a consumer checkout session is CREATED — not on expiry.
//             Klaviyo holds the delay, the app just reports state promptly.
//     removed the moment checkout completes or the subscription reaches
//             trialing/active
//
//   ASSUMPTION THAT MUST NOT BE LOST: someone mid-payment is briefly on list 2
//   and is removed within seconds of paying. Paige's Klaviyo flow uses a delay
//   of AT LEAST ONE HOUR before the first email, so nobody who completes
//   checkout normally is ever emailed. If that delay is ever shortened, this
//   design has to be revisited.
//
// CONSENT, and the difference is deliberate:
//   • list 1 is marketing → profiles.personalised_offers_consent must be true.
//   • list 2 is a SERVICE message about an action she started minutes earlier,
//     so it is sent regardless of that flag. Do not "tidy" this into a single
//     consent check.
// Neither push ever sets or changes anyone's Klaviyo marketing consent.
//
// Every push is wrapped: a Klaviyo failure must never break sign-up, checkout or
// the webhook's subscription recording. Outcomes are written to
// public.klaviyo_sync_log so failures are queryable, not console-only.

import { addToKlaviyoList, logKlaviyoSync, paywallListId, abandonedListId, removeFromKlaviyoList } from "./klaviyo.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

const ACTIVE = new Set(["active", "trialing"]);

let missingLogged: Record<string, boolean> = {};
/** Logs a missing env var once per isolate, then stays quiet. */
function noteMissingList(which: "paywall" | "abandoned"): void {
  if (missingLogged[which]) return;
  missingLogged[which] = true;
  console.log(
    `[klaviyo-nurture] ${which} list id not configured — skipping pushes`,
    which === "paywall" ? "KLAVIYO_PAYWALL_LIST_ID" : "KLAVIYO_ABANDONED_LIST_ID",
  );
}

export interface NurtureMember {
  userId: string;
  email: string;
  name: string | null;
  phone: string | null;
  offersConsent: boolean;
  status: string;
  properties: Record<string, string>;
}

/**
 * Everything Klaviyo needs to branch a flow without asking the database, read
 * once per push. These are refreshed when a list membership changes — i.e. on a
 * material event — never on a page load.
 */
export async function loadNurtureMember(
  admin: Admin,
  userId: string,
): Promise<NurtureMember | null> {
  const [profileRes, subRes, authRes, bloodRes, goalRes, healthRes, hairRes, styleRes] =
    await Promise.all([
      admin.from("profiles")
        .select("display_name, phone_number, personalised_offers_consent, international_block, deletion_requested_at, created_at, trial_offer_at, avatar_url, birth_year, postcode, country")
        .eq("user_id", userId).maybeSingle(),
      admin.from("consumer_subscriptions").select("status").eq("user_id", userId).maybeSingle(),
      admin.auth.admin.getUserById(userId),
      admin.from("blood_results").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("user_goals").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("user_health_profile").select("diet, sleep_quality").eq("user_id", userId).maybeSingle(),
      admin.from("user_hair_profile").select("porosity, areas_of_concern").eq("user_id", userId).maybeSingle(),
      admin.from("user_style_profile").select("current_hairstyle, style_set_at").eq("user_id", userId).maybeSingle(),
    ]);

  const profile = profileRes.data as Record<string, unknown> | null;
  if (profile?.international_block || profile?.deletion_requested_at) return null;

  const email = String(authRes?.data?.user?.email ?? "").toLowerCase();
  if (!email) return null;
  // Internal audit accounts must never reach Klaviyo.
  if (/^audit\..*@teamtexture\.co\.uk$/.test(email)) return null;

  const health = healthRes.data as Record<string, unknown> | null;
  const hair = hairRes.data as Record<string, unknown> | null;
  const style = styleRes.data as Record<string, unknown> | null;

  // The six onboarding steps, mirroring getConsumerOnboardingStatus.
  const didAboutYou = !!(
    profile?.avatar_url && String(profile?.display_name ?? "").trim() &&
    String(profile?.phone_number ?? "").trim() && profile?.birth_year &&
    String(profile?.postcode ?? "").trim() && String(profile?.country ?? "").trim()
  );
  const steps = [
    (goalRes.count ?? 0) > 0,                                   // 1 goal & challenges
    didAboutYou,                                                // 2 about you
    !!(health?.diet && health?.sleep_quality),                  // 3 health
    !!(hair?.porosity && Array.isArray(hair?.areas_of_concern) &&
      (hair?.areas_of_concern as unknown[]).length > 0),        // 4 hair characteristics
    !!(style?.current_hairstyle && style?.style_set_at),        // 5 colour & style
    (bloodRes.count ?? 0) > 0,                                  // 6 blood work
  ];

  const offersConsent = profile?.personalised_offers_consent === true;
  const registeredAt = String(profile?.created_at ?? profile?.trial_offer_at ?? "");

  return {
    userId,
    email,
    name: (profile?.display_name as string | null) ?? null,
    phone: profile?.phone_number ? String(profile.phone_number) : null,
    offersConsent,
    status: (subRes.data?.status as string | null) ?? "none",
    properties: {
      strand_account_type: "member",
      blood_markers: String(bloodRes.count ?? 0),
      onboarding_steps_done: String(steps.filter(Boolean).length),
      did_about_you: didAboutYou ? "true" : "false",
      offers_consent: offersConsent ? "true" : "false",
      ...(registeredAt ? { registered_at: registeredAt } : {}),
    },
  };
}

/** LIST 1 add. Idempotent (Klaviyo upserts membership), consent-gated. */
export async function addToPaywallList(admin: Admin, userId: string): Promise<void> {
  const listId = paywallListId();
  if (!listId) return noteMissingList("paywall");
  try {
    const m = await loadNurtureMember(admin, userId);
    if (!m) return;
    if (ACTIVE.has(m.status)) return;      // already converted — never add
    if (!m.offersConsent) return;          // marketing list: explicit yes only
    const error = await addToKlaviyoList({
      listId,
      email: m.email,
      name: m.name,
      phone: m.phone,
      // NEVER set consent as a side effect of a nurture push.
      marketingConsent: null,
      properties: { ...m.properties, strand_stage: "reached_paywall" },
    });
    if (error) console.error("[klaviyo-nurture] paywall add failed", error);
    await logKlaviyoSync(admin, {
      email: m.email, user_id: userId, list_id: listId,
      action: "paywall_add", ok: !error, error,
    });
  } catch (e) {
    console.error("[klaviyo-nurture] paywall add threw", e);
  }
}

/**
 * LIST 2 add — at checkout session CREATION. Sent regardless of
 * personalised_offers_consent: service message, see the header note.
 */
export async function addToAbandonedList(admin: Admin, userId: string): Promise<void> {
  const listId = abandonedListId();
  if (!listId) return noteMissingList("abandoned");
  try {
    const m = await loadNurtureMember(admin, userId);
    if (!m) return;
    if (ACTIVE.has(m.status)) return;      // already paying — nothing to chase
    const error = await addToKlaviyoList({
      listId,
      email: m.email,
      name: m.name,
      phone: m.phone,
      marketingConsent: null,
      properties: { ...m.properties, strand_stage: "checkout_started" },
    });
    if (error) console.error("[klaviyo-nurture] abandoned add failed", error);
    await logKlaviyoSync(admin, {
      email: m.email, user_id: userId, list_id: listId,
      action: "abandoned_add", ok: !error, error,
    });
  } catch (e) {
    console.error("[klaviyo-nurture] abandoned add threw", e);
  }
}

/** Removes from one nurture list by email, logging the outcome. */
async function removeOne(
  admin: Admin,
  listId: string,
  email: string,
  userId: string | null,
  action: string,
  reason: string,
): Promise<string | null> {
  const error = await removeFromKlaviyoList({ listId, email });
  if (error) {
    // LOUD: a paying member receiving "you never subscribed" emails is the worst
    // outcome here — worse than sending nothing at all.
    console.error("[klaviyo-nurture] REMOVAL FAILED", { listId, email, reason, error });
  }
  await logKlaviyoSync(admin, {
    email, user_id: userId, list_id: listId,
    action, ok: !error, error, context: { reason },
  });
  return error;
}

export async function removeFromPaywallList(
  admin: Admin,
  email: string,
  userId: string | null,
  reason: string,
): Promise<void> {
  const listId = paywallListId();
  if (!listId) return noteMissingList("paywall");
  try {
    await removeOne(admin, listId, email, userId, "paywall_remove", reason);
  } catch (e) {
    console.error("[klaviyo-nurture] paywall remove threw", e);
  }
}

export async function removeFromAbandonedList(
  admin: Admin,
  email: string,
  userId: string | null,
  reason: string,
): Promise<void> {
  const listId = abandonedListId();
  if (!listId) return noteMissingList("abandoned");
  try {
    await removeOne(admin, listId, email, userId, "abandoned_remove", reason);
  } catch (e) {
    console.error("[klaviyo-nurture] abandoned remove threw", e);
  }
}

/**
 * CONVERSION. Called from every path that can reach trialing/active: the
 * webhook, checkout completion (which routes through the webhook) and the
 * verify function. Removes from BOTH nurture lists.
 */
export async function removeFromNurtureLists(
  admin: Admin,
  opts: { userId: string; email?: string | null; reason: string },
): Promise<void> {
  let email = (opts.email ?? "").toLowerCase();
  if (!email) {
    try {
      const { data } = await admin.auth.admin.getUserById(opts.userId);
      email = String(data?.user?.email ?? "").toLowerCase();
    } catch (e) {
      console.error("[klaviyo-nurture] could not resolve email for removal", opts.userId, e);
    }
  }
  if (!email) return;
  await Promise.all([
    removeFromPaywallList(admin, email, opts.userId, opts.reason),
    removeFromAbandonedList(admin, email, opts.userId, opts.reason),
  ]);
}
