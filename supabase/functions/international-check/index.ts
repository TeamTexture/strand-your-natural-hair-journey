// Post-registration UK gate — SELF-DECLARED country only.
//
// Called from the first page of the hair/blood section, where the member types
// their own name, mobile, age, postcode, country and ethnicity. There is NO IP
// geolocation anywhere in this flow (VPN/proxy made it unreliable).
//
// When the declared country isn't the UK:
//   1. flags the account (profiles.international_block) so the block survives
//      every future login — later logins read the stored flag only,
//   2. records the account in public.country_waitlist (admin-only reads),
//   3. pushes name / mobile / email / country into the international Klaviyo
//      list — and no other list or flow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

const KLAVIYO_LIST_ID = "U69M2Q";

/** Country names (lower-cased) that count as the UK when the member declares one. */
const UK_NAMES = new Set([
  "united kingdom", "uk", "u.k.", "gb", "great britain", "england", "scotland",
  "wales", "northern ireland", "guernsey", "jersey", "isle of man",
]);

/** Add the blocked account to the international Klaviyo list only. */
async function pushToKlaviyo(
  name: string,
  email: string,
  phone: string | null,
  country: string,
): Promise<string | null> {
  const key = Deno.env.get("KLAVIYO_API_KEY");
  if (!key) return "KLAVIYO_API_KEY missing";
  const properties: Record<string, string> = {
    first_name: name,
    strand_country: country,
    strand_status: "international_waitlist",
  };
  if (phone) properties.strand_mobile = phone;
  try {
    const res = await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        revision: "2024-10-15",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: [{
                type: "profile",
                attributes: {
                  email,
                  properties,
                  subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                },
              }],
            },
          },
          relationships: { list: { data: { type: "list", id: KLAVIYO_LIST_ID } } },
        },
      }),
    });
    if (!res.ok) return `klaviyo ${res.status}: ${(await res.text()).slice(0, 400)}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "klaviyo push failed";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  let declared: string | null = null;
  let declaredPhone: string | null = null;
  let declaredName: string | null = null;
  try {
    const body = await req.json() as {
      declared_country?: unknown;
      phone?: unknown;
      name?: unknown;
    } | null;
    if (typeof body?.declared_country === "string" && body.declared_country.trim()) {
      declared = body.declared_country.trim();
    }
    if (typeof body?.phone === "string" && body.phone.trim()) declaredPhone = body.phone.trim();
    if (typeof body?.name === "string" && body.name.trim()) declaredName = body.name.trim();
  } catch (_e) { /* no body */ }

  // No declared country = nothing to decide. Fail OPEN: never block on silence.
  if (!declared) return json(200, { blocked: false, country: null, source: "no-declaration" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, phone_number, international_block")
    .eq("user_id", user.id)
    .maybeSingle();

  // Once blocked, always blocked — the flag is never cleared by a later call.
  const alreadyBlocked = !!profile?.international_block;
  const blocked = alreadyBlocked || !UK_NAMES.has(declared.toLowerCase());

  await admin
    .from("profiles")
    .update({
      geo_checked_at: new Date().toISOString(),
      international_block: blocked,
      international_country: blocked ? declared : null,
    })
    .eq("user_id", user.id);

  if (!blocked) return json(200, { blocked: false, country: declared, source: "declared" });

  const name = (declaredName || profile?.display_name ||
    (user.user_metadata as { display_name?: string } | null)?.display_name || "").toString().trim() || "Member";
  const phone = declaredPhone || (profile?.phone_number ? String(profile.phone_number) : null);
  const email = (user.email ?? "").toLowerCase();
  const klaviyoError = email
    ? await pushToKlaviyo(name, email, phone, declared)
    : "no email on account";

  await admin.from("country_waitlist").upsert({
    user_id: user.id,
    name,
    email,
    phone,
    country: declared,
    ip_detected_country: null,
    blocked_at: new Date().toISOString(),
    klaviyo_synced_at: klaviyoError ? null : new Date().toISOString(),
    klaviyo_error: klaviyoError,
  }, { onConflict: "user_id" });

  return json(200, { blocked: true, country: declared, source: "declared", klaviyo_error: klaviyoError });
});
