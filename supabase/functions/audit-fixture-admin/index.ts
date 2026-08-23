// ONE-SHOT FIXTURE SEEDER — creates the synthetic admin audit account.
//
// This function exists only to mint `strand-audit-admin@mystrand-test.co.uk`
// so admin-panel testing can happen through real authenticated click-through
// without ever signing in as a real admin. It is DELETED immediately after the
// account is created — a permanently deployed endpoint that can grant the
// admin role would be a privilege-escalation surface.
//
// It refuses to touch any address other than the one fixed email below, and it
// never accepts a role, email or password from the caller.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

declare const Deno: { env: { get(k: string): string | undefined } };

const FIXTURE_EMAIL = "strand-audit-admin@mystrand-test.co.uk";
const FIXTURE_PASSWORD = "StrandAudit!2026";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Only callable with the one-time fixture token (never from a browser
  // session). The secret is deleted along with this function.
  const token = req.headers.get("x-fixture-token") ?? "";
  const expected = Deno.env.get("AUDIT_FIXTURE_TOKEN") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!expected || !serviceKey || token !== expected) {
    return json(401, { error: "unauthenticated" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Reuse the account if a previous run already made it.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let userId = list?.users?.find((u) => u.email === FIXTURE_EMAIL)?.id ?? null;

  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: FIXTURE_EMAIL,
      password: FIXTURE_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "TEST Audit Admin", is_audit_fixture: true },
    });
    if (error) return json(500, { error: error.message });
    userId = created.user?.id ?? null;
  }
  if (!userId) return json(500, { error: "no user id" });

  // Obviously-fake profile data — never a copy of a real member.
  await admin.from("profiles").upsert(
    {
      user_id: userId,
      display_name: "TEST Audit Admin",
      full_name: "TEST Audit Admin",
      email: FIXTURE_EMAIL,
    },
    { onConflict: "user_id" },
  );

  // Admin role. `user_roles` is the only place roles may live.
  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleErr) return json(500, { error: `role: ${roleErr.message}` });

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  return json(200, {
    ok: true,
    user_id: userId,
    email: FIXTURE_EMAIL,
    roles: (roles ?? []).map((r) => r.role),
  });
});
