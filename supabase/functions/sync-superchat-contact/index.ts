// Syncs a member's WhatsApp opt-in state into Superchat (api.superchat.com).
//
// Invoked by the AFTER INSERT/UPDATE trigger on public.profiles over pg_net when
// whatsapp_opt_in, phone_number or display_name changes. It is fire-and-forget:
// it ALWAYS returns 200 so a Superchat outage can never block onboarding or a
// profile save. Every failure is logged to the edge function logs.
//
// Two things happen here, both consent-gated:
//   1. the messaging contact itself (created only when she has opted in AND has
//      a phone number on file — registration alone never pushes anyone), and
//   2. her PAID / NON-PAID list membership, recomputed from her CURRENT
//      subscription state. A free trial is NOT paid.
// Both live in ../_shared/superchat-lists.ts so the Stripe webhooks and the
// reconciliation job take exactly the same decision.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { authoriseTriggerCall } from "../_shared/app-email/trigger-auth.ts";
import {
  addContactToList,
  listsForContact,
  removeContactFromList,
  resolveListIdByName,
  superchatKey,
} from "../_shared/superchat.ts";
import { syncSuperchatLists } from "../_shared/superchat-lists.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

/** The legacy consent list, kept so existing Superchat automations still work. */
const OPT_IN_LIST_NAME = "WhatsApp opt-in";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only the database trigger (or a service-role caller) may drive this sync.
  const denied = authoriseTriggerCall(req);
  if (denied) return json(denied.body, denied.status);

  const key = superchatKey();

  try {
    const { user_id } = await req.json().catch(() => ({}));
    if (typeof user_id !== "string" || !user_id) {
      return json({ ok: false, reason: "missing user_id" });
    }
    if (!key) {
      console.error("sync-superchat-contact: SUPERCHAT_API_KEY is not configured");
      return json({ ok: false, reason: "not_configured" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Contact creation, consent gate and PAID / NON-PAID routing all happen here.
    const outcome = await syncSuperchatLists(admin, user_id, "profile_change");

    // Legacy consent list, mirrored from the same opt-in flag.
    const { data: profile } = await admin
      .from("profiles")
      .select("whatsapp_opt_in, superchat_contact_id")
      .eq("user_id", user_id)
      .maybeSingle();
    const contactId = String(profile?.superchat_contact_id ?? "").trim();
    if (contactId) {
      const listId = await resolveListIdByName(key, OPT_IN_LIST_NAME);
      if (listId) {
        const on = await listsForContact(key, contactId);
        const optedIn = profile?.whatsapp_opt_in === true;
        if (optedIn && !on.includes(listId)) {
          await addContactToList(key, contactId, listId);
        } else if (!optedIn && on.includes(listId)) {
          await removeContactFromList(key, contactId, listId);
        }
      }
    }

    return json({ ok: true, outcome });
  } catch (e) {
    // Never throw back at the caller: the trigger must not fail a profile write.
    console.error("sync-superchat-contact failed:", e);
    return json({ ok: false, reason: "unhandled_error" });
  }
});
