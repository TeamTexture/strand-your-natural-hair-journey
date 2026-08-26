// Reports nurture-list state for the SIGNED-IN member.
//
// Identity always comes from the caller's JWT — a client can never nominate
// another member. The only mode is "paywall": called once at sign-up, right
// after profiles.trial_offer_at is stamped.
//
// Existing members stamped by direct SQL are NOT backfilled here (Paige imports
// those 121 by CSV). The add is idempotent, so a later re-stamp cannot duplicate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { addToPaywallList } from "../_shared/klaviyo-nurture.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;

  let mode = "paywall";
  try {
    const body = await req.json() as { mode?: unknown } | null;
    if (typeof body?.mode === "string") mode = body.mode;
  } catch (_e) { /* default */ }
  if (mode !== "paywall") return json(400, { error: "Unknown mode" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Never fails the caller: the helper swallows and logs its own failures.
  await addToPaywallList(admin, auth.user.id);
  return json(200, { ok: true });
});
