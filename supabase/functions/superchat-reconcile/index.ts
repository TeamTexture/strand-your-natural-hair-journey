// Reconciliation for the PAID / NON-PAID Superchat lists.
//
// WHY THIS EXISTS: the Stripe webhook is the primary path, but a webhook outage
// (which has happened on the consumer tier) would otherwise leave a member in
// the wrong list forever. This job recomputes list membership from the
// subscription state the app already holds, so a missed event self-heals.
//
// Modes:
//   { mode: "all" }                 every member who has opted in to messaging
//   { mode: "user", user_id: "…" }  a single member
// Both are idempotent and consent-gated — a member without WhatsApp opt-in is
// never created in Superchat, and an existing contact whose opt-in was withdrawn
// is removed from both lists.
//
// Admin or service-role callers only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { preflight, json } from "../_shared/cors.ts";
import { requireAdminOrService } from "../_shared/auth.ts";
import {
  removeSuperchatLists,
  syncSuperchatLists,
  type SyncOutcome,
} from "../_shared/superchat-lists.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const gate = await requireAdminOrService(req);
  if (gate instanceof Response) return gate;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === "string" ? body.mode : "all";

  if (mode === "user") {
    const userId = typeof body?.user_id === "string" ? body.user_id : "";
    if (!userId) return json(400, { error: "user_id is required for mode 'user'" });
    const outcome = await syncSuperchatLists(admin, userId, "reconcile_user");
    return json(200, { mode, user_id: userId, outcome });
  }

  if (mode !== "all") return json(400, { error: "unknown mode" });

  // Anyone with a messaging consent OR an existing contact needs checking: the
  // second group is how a withdrawn opt-in gets cleaned up.
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, whatsapp_opt_in, superchat_contact_id, deletion_requested_at")
    .or("whatsapp_opt_in.is.true,superchat_contact_id.not.is.null");
  if (error) return json(500, { error: error.message });

  const rows = (data ?? []) as Array<{
    user_id: string;
    deletion_requested_at: string | null;
  }>;

  const tally: Record<string, number> = {};
  for (const row of rows) {
    if (row.deletion_requested_at) {
      await removeSuperchatLists(admin, row.user_id, "reconcile_deleted");
      tally.removed_deleted = (tally.removed_deleted ?? 0) + 1;
      continue;
    }
    const outcome: SyncOutcome = await syncSuperchatLists(
      admin,
      row.user_id,
      "reconcile_all",
    );
    tally[outcome] = (tally[outcome] ?? 0) + 1;
  }

  return json(200, { mode, considered: rows.length, ...tally });
});
