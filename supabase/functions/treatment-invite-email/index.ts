// Immediate plan invitation email, called by the pro and admin assign flows
// right after the assignment row is created. Composition, gating, logging and
// idempotency all live in the shared send path.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { serviceClient } from "../_shared/app-email/core.ts";
import { sendPlanInvitation } from "../_shared/app-email/treatment-invite.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userRes } = await anon.auth.getUser();
  const caller = userRes?.user;
  if (!caller) return json({ error: "Unauthorized" }, 401);

  let assignmentId = "";
  try {
    const body = await req.json();
    assignmentId = String(body?.assignment_id ?? "").trim();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) {
    return json({ error: "A valid assignment_id is required." }, 400);
  }

  const admin = serviceClient();

  // Only the person who created the assignment (or an admin) may trigger it.
  const { data: a } = await admin
    .from("treatment_plan_assignments")
    .select("id, assigner_user_id, professional_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) return json({ error: "Not found" }, 404);

  let allowed = a.assigner_user_id === caller.id;
  if (!allowed) {
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    allowed = isAdmin === true;
  }
  if (!allowed) return json({ error: "Forbidden" }, 403);

  try {
    const result = await sendPlanInvitation(admin, assignmentId);
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.error("treatment-invite-email error", err);
    return json({ ok: false, sent: false, error: String(err) }, 500);
  }
});
