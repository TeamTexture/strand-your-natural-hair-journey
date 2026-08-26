// Shared Klaviyo helpers.
//
// TWO DISTINCT PUSHES, and the difference matters legally:
//
//  • addToKlaviyoList()  — list MEMBERSHIP only, via
//    POST /api/lists/{id}/relationships/profiles. It never touches the profile's
//    email marketing subscription. Marketing consent is set ONLY when the member
//    has actually said yes (marketingConsent === true); false/null adds her to
//    the list and leaves whatever consent state she already has alone. An
//    existing consent is never overridden or revoked here.
//
//  • pushToKlaviyoList() — LEGACY. Force-subscribes (consent: "SUBSCRIBED").
//    Still used by the sign-up member list and the international waitlist; those
//    paths are being reviewed separately.
//
// Both return null on success or a human-readable error (never throw).

/** The STRAND member (consumer) mailing list. Professionals/brands never go here. */
export const KLAVIYO_MEMBER_LIST_ID = "VUuiA7";

/** Paying + trialing members. Configurable, so Paige can move the list. */
export const KLAVIYO_PAID_MEMBER_LIST_ID =
  Deno.env.get("KLAVIYO_PAID_LIST_ID") || "UehA5B";

function headers(key: string) {
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: "2024-10-15",
    "content-type": "application/json",
  };
}

const e164 = (phone: string) => {
  const cleaned = phone.replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
};

function profileAttributes(opts: {
  email: string;
  name?: string | null;
  phone?: string | null;
  properties?: Record<string, string>;
}) {
  const properties: Record<string, string> = { ...(opts.properties ?? {}) };
  if (opts.phone) properties.strand_mobile = opts.phone;
  const attrs: Record<string, unknown> = { email: opts.email, properties };
  const name = (opts.name ?? "").trim();
  if (name) attrs.first_name = name;
  const phoneE164 = opts.phone ? e164(opts.phone) : null;
  if (phoneE164) attrs.phone_number = phoneE164;
  return attrs;
}

/** Upserts the profile and returns its Klaviyo id, or an error string. */
async function importProfile(
  key: string,
  attrs: Record<string, unknown>,
): Promise<{ id?: string; error?: string }> {
  const res = await fetch("https://a.klaviyo.com/api/profile-import", {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ data: { type: "profile", attributes: attrs } }),
  });
  const text = await res.text();
  if (!res.ok) return { error: `klaviyo profile-import ${res.status}: ${text.slice(0, 400)}` };
  try {
    const id = (JSON.parse(text) as { data?: { id?: string } }).data?.id;
    return id ? { id } : { error: "klaviyo profile-import returned no id" };
  } catch {
    return { error: "klaviyo profile-import returned unparseable body" };
  }
}

/**
 * Adds a profile to a list WITHOUT changing its marketing consent, then sets
 * consent only when the member has explicitly opted in.
 */
export async function addToKlaviyoList(opts: {
  listId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  properties?: Record<string, string>;
  /** true = she said yes. false/null = add to list, never touch consent. */
  marketingConsent?: boolean | null;
}): Promise<string | null> {
  const key = Deno.env.get("KLAVIYO_API_KEY");
  if (!key) return "KLAVIYO_API_KEY missing";
  const email = (opts.email ?? "").trim().toLowerCase();
  if (!email) return "no email";

  try {
    const imported = await importProfile(key, profileAttributes({ ...opts, email }));
    if (imported.error) return imported.error;

    const memberRes = await fetch(
      `https://a.klaviyo.com/api/lists/${opts.listId}/relationships/profiles`,
      {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify({ data: [{ type: "profile", id: imported.id }] }),
      },
    );
    if (!memberRes.ok && memberRes.status !== 409) {
      return `klaviyo list membership ${memberRes.status}: ${(await memberRes.text()).slice(0, 400)}`;
    }

    // CONSENT: only ever set forward, never cleared, and only on an explicit yes.
    if (opts.marketingConsent === true) {
      const subRes = await fetch(
        "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
        {
          method: "POST",
          headers: headers(key),
          body: JSON.stringify({
            data: {
              type: "profile-subscription-bulk-create-job",
              attributes: {
                profiles: {
                  data: [{
                    type: "profile",
                    attributes: {
                      email,
                      subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                    },
                  }],
                },
              },
              relationships: { list: { data: { type: "list", id: opts.listId } } },
            },
          }),
        },
      );
      if (!subRes.ok) {
        return `klaviyo subscribe ${subRes.status}: ${(await subRes.text()).slice(0, 400)}`;
      }
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "klaviyo push failed";
  }
}

/**
 * LEGACY force-subscribing push. Sets marketing consent regardless of the
 * member's recorded preference — do not use for new paths.
 */
export async function pushToKlaviyoList(opts: {
  listId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  properties?: Record<string, string>;
}): Promise<string | null> {
  const key = Deno.env.get("KLAVIYO_API_KEY");
  if (!key) return "KLAVIYO_API_KEY missing";
  const email = (opts.email ?? "").trim().toLowerCase();
  if (!email) return "no email";

  try {
    const imported = await importProfile(key, profileAttributes({ ...opts, email }));
    if (imported.error) return imported.error;

    const subRes = await fetch(
      "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
      {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify({
          data: {
            type: "profile-subscription-bulk-create-job",
            attributes: {
              profiles: {
                data: [{
                  type: "profile",
                  attributes: {
                    email,
                    subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                  },
                }],
              },
            },
            relationships: { list: { data: { type: "list", id: opts.listId } } },
          },
        }),
      },
    );
    if (!subRes.ok) {
      return `klaviyo subscribe ${subRes.status}: ${(await subRes.text()).slice(0, 400)}`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "klaviyo push failed";
  }
}

/** Records every paid-list push outcome in a table Paige can query. */
export async function logKlaviyoSync(
  admin: { from: (t: string) => { insert: (rows: unknown) => Promise<{ error: unknown }> } },
  row: {
    email?: string | null;
    user_id?: string | null;
    list_id?: string | null;
    action: string;
    ok: boolean;
    error?: string | null;
    context?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await admin.from("klaviyo_sync_log").insert([row]);
  } catch (_e) {
    // Logging must never break the caller.
  }
}
