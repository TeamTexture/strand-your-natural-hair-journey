// Post-registration UK gate.
//
// Called ONCE per account, immediately after registration and before onboarding.
// Detects the caller's country by IP, and when it isn't the UK:
//   1. flags the account (profiles.international_block) so the block survives
//      future logins without ever re-geo-checking anyone,
//   2. records the account in public.country_waitlist (admin-only reads),
//   3. pushes name / email / country into the international Klaviyo list.
//
// Never re-checks an account that already has profiles.geo_checked_at set, so a
// UK member travelling abroad is never affected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

const KLAVIYO_LIST_ID = "U69M2Q";

const HEADER_CANDIDATES = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-country-code",
  "fly-client-ip-country",
  "cloudfront-viewer-country",
  "x-geo-country",
  "x-appengine-country",
];
const IP_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "fly-client-ip"];
const UK_CODES = new Set(["GB", "UK", "GG", "JE", "IM"]);

const clientIp = (req: Request): string | null => {
  for (const h of IP_HEADERS) {
    const raw = req.headers.get(h);
    const first = raw?.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
};

const isPrivate = (ip: string) =>
  ip.startsWith("10.") || ip.startsWith("127.") || ip.startsWith("192.168.") ||
  ip.startsWith("172.16.") || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd");

async function detect(req: Request): Promise<{ country: string | null; country_name: string | null; source: string }> {
  for (const h of HEADER_CANDIDATES) {
    const v = req.headers.get(h)?.trim();
    if (v && /^[A-Za-z]{2}$/.test(v)) {
      return { country: v.toUpperCase(), country_name: null, source: `header:${h}` };
    }
  }
  const ip = clientIp(req);
  if (ip && !isPrivate(ip)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "strand-geo-gate/1.0" },
      });
      clearTimeout(t);
      if (res.ok) {
        const body = await res.json();
        const code = typeof body?.country_code === "string" ? body.country_code : null;
        if (code && /^[A-Za-z]{2}$/.test(code)) {
          return {
            country: code.toUpperCase(),
            country_name: typeof body?.country_name === "string" ? body.country_name : null,
            source: "ipapi",
          };
        }
      }
    } catch (_e) { /* inconclusive */ }
  }
  return { country: null, country_name: null, source: "inconclusive" };
}

/** Add the blocked account to the international Klaviyo list only. */
async function pushToKlaviyo(name: string, email: string, country: string): Promise<string | null> {
  const key = Deno.env.get("KLAVIYO_API_KEY");
  if (!key) return "KLAVIYO_API_KEY missing";
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
                  properties: { first_name: name, strand_country: country, strand_status: "international_waitlist" },
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, international_block, geo_checked_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // Already decided — never re-check (UK members travel).
  if (profile?.geo_checked_at) {
    return json(200, { blocked: !!profile.international_block, country: null, cached: true });
  }

  const { country, country_name, source } = await detect(req);
  // Fail OPEN: an inconclusive lookup never blocks a registration.
  const blocked = !!country && !UK_CODES.has(country);

  await admin
    .from("profiles")
    .update({ geo_checked_at: new Date().toISOString(), international_block: blocked })
    .eq("user_id", user.id);

  if (!blocked) return json(200, { blocked: false, country, source });

  const name = (profile?.display_name || user.user_metadata?.display_name || "").toString().trim() || "Member";
  const email = (user.email ?? "").toLowerCase();
  const klaviyoError = email ? await pushToKlaviyo(name, email, country_name || country!) : "no email on account";

  await admin.from("country_waitlist").upsert({
    user_id: user.id,
    name,
    email,
    country: country_name || country!,
    ip_detected_country: country,
    blocked_at: new Date().toISOString(),
    klaviyo_synced_at: klaviyoError ? null : new Date().toISOString(),
    klaviyo_error: klaviyoError,
  }, { onConflict: "user_id" });

  return json(200, { blocked: true, country, country_name, source });
});
