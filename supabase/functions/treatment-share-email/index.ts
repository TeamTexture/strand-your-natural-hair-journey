// Immediate share invitation email, called by the member's share flow right
// after the share row is created. Only the plan owner (or an admin) may trigger it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { serviceClient } from "../_shared/app-email/core.ts";
import { sendShareInvitation } from "../_shared/app-email/treatment-share.ts";

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

  let shareId = "";
  try {
    const body = await req.json();
    shareId = String(body?.share_id ?? "").trim();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) {
    return json({ error: "A valid share_id is required." }, 400);
  }

  const admin = serviceClient();

  const { data: sh } = await admin
    .from("treatment_plan_shares")
    .select("id, owner_user_id")
    .eq("id", shareId)
    .maybeSingle();
  if (!sh) return json({ error: "Not found" }, 404);

  let allowed = sh.owner_user_id === caller.id;
  if (!allowed) {
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    allowed = isAdmin === true;
  }
  if (!allowed) return json({ error: "Forbidden" }, 403);

  try {
    const result = await sendShareInvitation(admin, shareId);
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.error("treatment-share-email error", err);
    return json({ ok: false, sent: false, error: String(err) }, 500);
  }
});
