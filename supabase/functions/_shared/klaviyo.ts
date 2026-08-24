// Shared Klaviyo helpers.
//
// Klaviyo's subscription bulk-create job REJECTS a `properties` object on the
// profile, so every push is two calls, in this order:
//   1. POST /api/profile-import — upserts the profile with name + custom props,
//   2. POST /api/profile-subscription-bulk-create-jobs — subscribes it to a list.
// Both helpers return null on success or a human-readable error (never throw).

/** The STRAND member (consumer) mailing list. Professionals/brands never go here. */
export const KLAVIYO_MEMBER_LIST_ID = "SgLnKi";

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

  const properties: Record<string, string> = { ...(opts.properties ?? {}) };
  if (opts.phone) properties.strand_mobile = opts.phone;

  const profileAttributes: Record<string, unknown> = { email, properties };
  const name = (opts.name ?? "").trim();
  if (name) profileAttributes.first_name = name;
  const phoneE164 = opts.phone ? e164(opts.phone) : null;
  if (phoneE164) profileAttributes.phone_number = phoneE164;

  try {
    const importRes = await fetch("https://a.klaviyo.com/api/profile-import", {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ data: { type: "profile", attributes: profileAttributes } }),
    });
    if (!importRes.ok) {
      return `klaviyo profile-import ${importRes.status}: ${(await importRes.text()).slice(0, 400)}`;
    }

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
