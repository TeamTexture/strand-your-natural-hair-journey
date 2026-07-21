// Logs a passport view. Called from the client on mount and section change.
// Runs with service_role so viewers cannot suppress logging.
// Accepts both professional viewers (with active client access) and admins
// (verified server-side via has_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  let body: { consumer_id?: string; section?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  const consumerId = body.consumer_id;
  const section = body.section ?? null;
  if (!consumerId || typeof consumerId !== "string") {
    return json(400, { error: "consumer_id required" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: "supabase env missing" });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Admins can view any member's passport without a consent record.
  // Verified server-side so the client cannot forge admin status.
  const { data: isAdmin, error: adminErr } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (adminErr) return json(500, { error: adminErr.message });

  if (!isAdmin) {
    // Non-admin viewers must be pros with an active consent link.
    const { data: hasAccess, error: accessErr } = await admin.rpc(
      "has_active_client_access",
      { _pro: user.id, _consumer: consumerId },
    );
    if (accessErr) return json(500, { error: accessErr.message });
    if (!hasAccess) return json(403, { error: "no active client access" });
  }

  const { error } = await admin.from("pro_passport_views").insert({
    pro_user_id: user.id,
    consumer_id: consumerId,
    section,
  });
  if (error) return json(500, { error: error.message });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
