// Syncs a member's WhatsApp opt-in state into Superchat (api.superchat.com).
//
// Invoked by the AFTER INSERT/UPDATE trigger on public.profiles over pg_net when
// whatsapp_opt_in, phone_number or display_name changes. It is fire-and-forget:
// it ALWAYS returns 200 so a Superchat outage can never block onboarding or a
// profile save. Every failure is logged to the edge function logs.
//
// Superchat Public API (verified against the live OpenAPI spec, 2026-09-04):
//   POST   /contacts                                   create contact
//   POST   /contacts/search                            find by phone handle
//   PATCH  /contacts/{contactId}                       update name
//   GET    /contacts/{contactId}/contact-lists         lists the contact is on
//   POST   /contacts/{contactId}/contact-lists         add to a list  { id }
//   DELETE /contacts/{contactId}/contact-lists/{listId} remove from a list
//   GET    /contact-lists                              list the workspace lists
// Auth header is X-API-KEY. NOTE: the Public API has no create-contact-list
// endpoint, so the "WhatsApp opt-in" list must exist in the Superchat workspace;
// if it doesn't, the contact is still synced and the missing list is logged.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { authoriseTriggerCall } from "../_shared/app-email/trigger-auth.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

const BASE = "https://api.superchat.com/v1.0";
const LIST_NAME = "WhatsApp opt-in";

/** Cached across invocations of a warm isolate — the list id never changes. */
let cachedListId: string | null = null;

interface ContactList {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  handles?: Array<{ id?: string | null; type?: string; value?: string }>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sc(
  key: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "X-API-KEY": key,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    console.error(`superchat ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return { ok: res.ok, status: res.status, data };
}

/** Splits a display name into first / last. A single word has no last name. */
function splitName(display: string | null): { first: string | null; last: string | null } {
  const parts = (display ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function resolveListId(key: string): Promise<string | null> {
  if (cachedListId) return cachedListId;
  const { ok, data } = await sc(key, "GET", "/contact-lists?limit=100");
  if (!ok) return null;
  const results = (data as { results?: ContactList[] } | null)?.results ?? [];
  const wanted = LIST_NAME.toLowerCase();
  const found = results.find((l) => (l.name ?? "").trim().toLowerCase() === wanted);
  if (!found) {
    console.error(
      `sync-superchat-contact: no Superchat contact list named "${LIST_NAME}" — create it in Superchat (the Public API cannot create lists)`,
    );
    return null;
  }
  cachedListId = found.id;
  return found.id;
}

/** Finds an existing contact by phone handle so we never create duplicates. */
async function findContactByPhone(key: string, phone: string): Promise<string | null> {
  const { ok, data } = await sc(key, "POST", "/contacts/search?limit=1", {
    query: { value: [{ field: "phone", operator: "=", value: phone }] },
  });
  if (!ok) return null;
  const results = (data as { results?: Contact[] } | null)?.results ?? [];
  return results[0]?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only the database trigger (or a service-role caller) may drive this sync.
  const denied = authoriseTriggerCall(req);
  if (denied) return json(denied.body, denied.status);

  const key = (Deno.env.get("SUPERCHAT_API_KEY") ?? "").trim();

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

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, display_name, phone_number, whatsapp_opt_in, superchat_contact_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!profile) return json({ ok: false, reason: "profile_not_found" });

    const optedIn = profile.whatsapp_opt_in === true;
    const phone = (profile.phone_number ?? "").trim();
    let contactId = (profile.superchat_contact_id ?? "").trim() || null;

    // ---------------------------------------------------------------- opted OUT
    if (!optedIn) {
      if (!contactId) return json({ ok: true, skipped: "never_synced" });
      const listId = await resolveListId(key);
      if (listId) {
        // The contact itself is kept — only the broadcast list membership goes.
        await sc(key, "DELETE", `/contacts/${contactId}/contact-lists/${listId}`);
      }
      return json({ ok: true, action: "removed_from_list" });
    }

    // ----------------------------------------------------------------- opted IN
    if (!phone) {
      console.warn(`sync-superchat-contact: ${user_id} opted in with no phone number on file`);
      return json({ ok: true, skipped: "no_phone" });
    }

    // Email comes from the auth record, not from profiles.
    let email: string | null = null;
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(user_id);
      email = authUser?.user?.email ?? null;
    } catch (e) {
      console.warn("sync-superchat-contact: could not read auth email", e);
    }

    const { first, last } = splitName(profile.display_name ?? null);
    const handles: Array<{ id: null; type: "phone" | "mail"; value: string }> = [
      { id: null, type: "phone", value: phone },
    ];
    if (email) handles.push({ id: null, type: "mail", value: email });

    // Reuse an existing Superchat contact for this number when we don't hold an id.
    if (!contactId) contactId = await findContactByPhone(key, phone);

    if (contactId) {
      // Names only: sending `handles` here would REPLACE the full handle list.
      await sc(key, "PATCH", `/contacts/${contactId}`, {
        first_name: first,
        last_name: last,
        gender: null,
      });
    } else {
      const created = await sc(key, "POST", "/contacts", {
        first_name: first,
        last_name: last,
        gender: null,
        handles,
      });
      if (!created.ok) return json({ ok: false, reason: "contact_create_failed" });
      contactId = (created.data as { id?: string } | null)?.id ?? null;
      if (!contactId) return json({ ok: false, reason: "contact_id_missing" });
    }

    // Idempotency: remember the contact id so later updates never duplicate.
    if (contactId !== (profile.superchat_contact_id ?? null)) {
      const { error } = await admin
        .from("profiles")
        .update({ superchat_contact_id: contactId })
        .eq("user_id", user_id);
      if (error) console.error("sync-superchat-contact: could not store contact id", error);
    }

    const listId = await resolveListId(key);
    if (!listId) return json({ ok: true, action: "contact_synced", list: "missing" });

    const already = await sc(key, "GET", `/contacts/${contactId}/contact-lists?limit=100`);
    const onList = (
      (already.data as { results?: ContactList[] } | null)?.results ?? []
    ).some((l) => l.id === listId);
    if (!onList) {
      await sc(key, "POST", `/contacts/${contactId}/contact-lists`, { id: listId });
    }

    return json({ ok: true, action: "contact_synced", list: onList ? "already" : "added" });
  } catch (e) {
    // Never throw back at the caller: the trigger must not fail a profile write.
    console.error("sync-superchat-contact failed:", e);
    return json({ ok: false, reason: "unhandled_error" });
  }
});
