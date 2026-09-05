// PAID / NON-PAID Superchat list routing.
//
// SOURCE OF TRUTH is the member's CURRENT subscription state, never the moment
// she registered:
//   PAID     — consumer subscription `active` and not paused, OR an active
//              professional subscription, OR complimentary access.
//   NON-PAID — everything else, EXPLICITLY INCLUDING a free trial
//              (`trialing`), plus past_due, canceled, incomplete, unpaid,
//              paused, "none" and no subscription row at all.
//
// A member is never on both lists: moving into one removes the other in the
// same call.
//
// CONSENT IS ABSOLUTE. Superchat is a messaging channel, so a contact is only
// ever created or listed when profiles.whatsapp_opt_in is true AND a phone
// number is on file. Withdrawing opt-in removes her from both lists. Nothing
// here pushes anyone on registration alone.
//
// Every call is defensive: a Superchat outage must never fail a Stripe webhook,
// a profile save or an erasure run. Outcomes go to the edge function logs.

import {
  addContactToList,
  findContactByPhone,
  listsForContact,
  removeContactFromList,
  resolveListIdByName,
  sc,
  splitName,
  superchatKey,
} from "./superchat.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

// deno-lint-ignore no-explicit-any
type Admin = any;

// The two lists that already exist in the Superchat workspace. The Public API
// cannot create a contact list, so these names must match the workspace exactly;
// both are overridable by env var so a rename in Superchat needs no code change.
export const SUPERCHAT_PAID_LIST_NAME =
  Deno.env.get("SUPERCHAT_PAID_LIST_NAME") || "Paying STRAND Customers";
export const SUPERCHAT_NON_PAID_LIST_NAME =
  Deno.env.get("SUPERCHAT_NON_PAID_LIST_NAME") || "TRIAL/NOT SUBSCRIBED";

/** Optional per-tier lists, used only when they exist in the workspace. */
const TIER_LIST_NAME: Record<Tier, string> = {
  basic: "TIER BASIC",
  plus: "TIER PLUS",
  pro: "TIER PRO",
};

export type Tier = "basic" | "plus" | "pro";

export interface SubscriptionState {
  paid: boolean;
  tier: Tier;
  /** Raw status kept for the contact field, e.g. "trialing", "active", "none". */
  status: string;
}

export type SyncOutcome =
  | "paid"
  | "non_paid"
  | "removed_no_consent"
  | "skipped_no_phone"
  | "skipped_not_configured"
  | "skipped_no_profile"
  | "failed";

/** Reads current subscription state for a member and decides PAID vs NON-PAID. */
export async function readSubscriptionState(
  admin: Admin,
  userId: string,
): Promise<SubscriptionState> {
  const [consumerRes, proRes, profileRes] = await Promise.all([
    admin.from("consumer_subscriptions")
      .select("status, tier, paused").eq("user_id", userId).maybeSingle(),
    admin.from("pro_subscriptions")
      .select("status").eq("pro_user_id", userId).maybeSingle(),
    admin.from("profiles")
      .select("complimentary_access").eq("user_id", userId).maybeSingle(),
  ]);

  const consumer = (consumerRes?.data ?? null) as
    | { status?: string | null; tier?: string | null; paused?: boolean | null }
    | null;
  const pro = (proRes?.data ?? null) as { status?: string | null } | null;
  const complimentary =
    (profileRes?.data as { complimentary_access?: boolean | null } | null)
      ?.complimentary_access === true;

  const consumerStatus = (consumer?.status ?? "none").toLowerCase();
  const proStatus = (pro?.status ?? "none").toLowerCase();

  // A free trial is NOT paid. Only a live, unpaused, paying subscription is.
  const consumerPaying = consumerStatus === "active" && consumer?.paused !== true;
  const proPaying = proStatus === "active";
  const paid = consumerPaying || proPaying || complimentary;

  const tier: Tier = proPaying
    ? "pro"
    : (consumer?.tier ?? "").toLowerCase() === "plus"
      ? "plus"
      : "basic";

  const status = consumerStatus !== "none"
    ? consumerStatus
    : proStatus !== "none"
      ? proStatus
      : complimentary
        ? "complimentary"
        : "none";

  return { paid, tier, status };
}

interface MessagingContact {
  contactId: string;
  optedIn: boolean;
}

/**
 * Ensures a Superchat contact exists for an opted-in member, reusing the stored
 * id (or an existing contact on the same number) so nothing is ever duplicated.
 * Returns null when she has not opted in or has no phone number.
 */
async function ensureContact(
  admin: Admin,
  key: string,
  userId: string,
): Promise<MessagingContact | { skip: SyncOutcome }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, phone_number, whatsapp_opt_in, superchat_contact_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return { skip: "skipped_no_profile" };

  const optedIn = profile.whatsapp_opt_in === true;
  const phone = String(profile.phone_number ?? "").trim();
  let contactId = String(profile.superchat_contact_id ?? "").trim() || null;

  if (!optedIn) {
    // No consent: never create anything. An existing contact is de-listed.
    return contactId ? { contactId, optedIn: false } : { skip: "removed_no_consent" };
  }
  if (!phone) {
    console.warn(`superchat-lists: ${userId} opted in with no phone number on file`);
    return { skip: "skipped_no_phone" };
  }

  let email: string | null = null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser?.user?.email ?? null;
  } catch (e) {
    console.warn("superchat-lists: could not read auth email", e);
  }

  const { first, last } = splitName(profile.display_name ?? null);
  if (!contactId) contactId = await findContactByPhone(key, phone);

  if (contactId) {
    // Names only: sending `handles` here would REPLACE the full handle list.
    await sc(key, "PATCH", `/contacts/${contactId}`, {
      first_name: first,
      last_name: last,
      gender: null,
    });
  } else {
    const handles: Array<{ id: null; type: "phone" | "mail"; value: string }> = [
      { id: null, type: "phone", value: phone },
    ];
    if (email) handles.push({ id: null, type: "mail", value: email });
    const created = await sc(key, "POST", "/contacts", {
      first_name: first,
      last_name: last,
      gender: null,
      handles,
    });
    if (!created.ok) return { skip: "failed" };
    contactId = (created.data as { id?: string } | null)?.id ?? null;
    if (!contactId) return { skip: "failed" };
  }

  if (contactId !== (profile.superchat_contact_id ?? null)) {
    const { error } = await admin
      .from("profiles")
      .update({ superchat_contact_id: contactId })
      .eq("user_id", userId);
    if (error) console.error("superchat-lists: could not store contact id", error);
  }

  return { contactId, optedIn: true };
}

/** Best-effort tier tag: a custom field plus a per-tier list when one exists. */
async function tagTier(key: string, contactId: string, state: SubscriptionState) {
  // Custom fields are workspace-configured; a rejection here is not a failure.
  await sc(key, "PATCH", `/contacts/${contactId}`, {
    custom_attributes: {
      strand_tier: state.tier,
      strand_paid: state.paid ? "true" : "false",
      strand_status: state.status,
    },
  }).catch(() => undefined);

  const wanted = TIER_LIST_NAME[state.tier];
  const wantedId = await resolveListIdByName(key, wanted);
  if (!wantedId) return; // tier lists are optional
  const on = await listsForContact(key, contactId);
  if (!on.includes(wantedId)) await addContactToList(key, contactId, wantedId);
  for (const t of Object.keys(TIER_LIST_NAME) as Tier[]) {
    if (t === state.tier) continue;
    const otherId = await resolveListIdByName(key, TIER_LIST_NAME[t]);
    if (otherId && on.includes(otherId)) {
      await removeContactFromList(key, contactId, otherId);
    }
  }
}

/**
 * The single entry point. Recomputes PAID / NON-PAID from current subscription
 * state and corrects the contact's list membership. Idempotent, so it is safe
 * to call from a webhook, a trigger and a reconciliation run.
 */
export async function syncSuperchatLists(
  admin: Admin,
  userId: string,
  reason: string,
): Promise<SyncOutcome> {
  const key = superchatKey();
  if (!key) {
    console.error("superchat-lists: SUPERCHAT_API_KEY is not configured");
    return "skipped_not_configured";
  }

  try {
    const paidId = await resolveListIdByName(key, SUPERCHAT_PAID_LIST_NAME);
    const nonPaidId = await resolveListIdByName(key, SUPERCHAT_NON_PAID_LIST_NAME);

    const ensured = await ensureContact(admin, key, userId);
    if ("skip" in ensured) return ensured.skip;

    const { contactId, optedIn } = ensured;
    const on = await listsForContact(key, contactId);

    // Consent withdrawn — off both lists, contact itself kept.
    if (!optedIn) {
      for (const id of [paidId, nonPaidId]) {
        if (id && on.includes(id)) await removeContactFromList(key, contactId, id);
      }
      console.log(`superchat-lists[${reason}] ${userId} -> removed (no consent)`);
      return "removed_no_consent";
    }

    const state = await readSubscriptionState(admin, userId);
    const targetId = state.paid ? paidId : nonPaidId;
    const otherId = state.paid ? nonPaidId : paidId;

    if (otherId && on.includes(otherId)) {
      await removeContactFromList(key, contactId, otherId);
    }
    if (targetId && !on.includes(targetId)) {
      await addContactToList(key, contactId, targetId);
    }
    await tagTier(key, contactId, state);

    console.log(
      `superchat-lists[${reason}] ${userId} -> ${state.paid ? "PAID" : "NON-PAID"} (status ${state.status}, tier ${state.tier})`,
    );
    return state.paid ? "paid" : "non_paid";
  } catch (e) {
    console.error(`superchat-lists[${reason}] failed for ${userId}`, e);
    return "failed";
  }
}

/** Account deleted: off BOTH lists. Never throws. */
export async function removeSuperchatLists(
  admin: Admin,
  userId: string,
  reason: string,
): Promise<void> {
  const key = superchatKey();
  if (!key) return;
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("superchat_contact_id")
      .eq("user_id", userId)
      .maybeSingle();
    const contactId = String(profile?.superchat_contact_id ?? "").trim();
    if (!contactId) return;
    const ids = await Promise.all([
      resolveListIdByName(key, SUPERCHAT_PAID_LIST_NAME),
      resolveListIdByName(key, SUPERCHAT_NON_PAID_LIST_NAME),
      resolveListIdByName(key, "WhatsApp opt-in"),
    ]);
    const on = await listsForContact(key, contactId);
    for (const id of ids) {
      if (id && on.includes(id)) await removeContactFromList(key, contactId, id);
    }
    console.log(`superchat-lists[${reason}] ${userId} -> removed from all lists`);
  } catch (e) {
    console.error(`superchat-lists[${reason}] removal failed for ${userId}`, e);
  }
}

/** Never called by the app — exported for the guard test. */
export const SUPERCHAT_TRIAL_IS_NOT_PAID = true;
