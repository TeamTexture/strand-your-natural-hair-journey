// Superchat Public API primitives, shared by the contact sync, the Stripe
// webhooks and the reconciliation job.
//
// Superchat Public API (verified against the live OpenAPI spec, 2026-09-04):
//   POST   /contacts                                   create contact
//   POST   /contacts/search                            find by phone handle
//   PATCH  /contacts/{contactId}                       update name
//   GET    /contacts/{contactId}/contact-lists         lists the contact is on
//   POST   /contacts/{contactId}/contact-lists         add to a list  { id }
//   DELETE /contacts/{contactId}/contact-lists/{listId} remove from a list
//   GET    /contact-lists                              list the workspace lists
// Auth header is X-API-KEY. The Public API has NO create-contact-list endpoint,
// so every list must already exist in the Superchat workspace; a missing list is
// logged and never treated as an error.

declare const Deno: { env: { get(key: string): string | undefined } };

export const SUPERCHAT_BASE = "https://api.superchat.com/v1.0";

export interface ContactList {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  handles?: Array<{ id?: string | null; type?: string; value?: string }>;
}

export const superchatKey = (): string =>
  (Deno.env.get("SUPERCHAT_API_KEY") ?? "").trim();

/** Raw call. Never throws on a non-2xx — the caller decides what that means. */
export async function sc(
  key: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${SUPERCHAT_BASE}${path}`, {
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
export function splitName(
  display: string | null,
): { first: string | null; last: string | null } {
  const parts = (display ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** name (lowercased) → list id, cached for the life of a warm isolate. */
const listCache = new Map<string, string | null>();
let listsLoadedAt = 0;

/** Resolves a workspace contact list id by exact (case-insensitive) name. */
export async function resolveListIdByName(
  key: string,
  name: string,
): Promise<string | null> {
  const wanted = name.trim().toLowerCase();
  const fresh = Date.now() - listsLoadedAt < 10 * 60_000;
  if (fresh && listCache.has(wanted)) return listCache.get(wanted) ?? null;

  const { ok, data } = await sc(key, "GET", "/contact-lists?limit=100");
  if (!ok) return null;
  const results = (data as { results?: ContactList[] } | null)?.results ?? [];
  listCache.clear();
  for (const l of results) {
    listCache.set((l.name ?? "").trim().toLowerCase(), l.id);
  }
  listsLoadedAt = Date.now();

  const found = listCache.get(wanted) ?? null;
  if (!found) {
    console.error(
      `superchat: no contact list named "${name}" — create it in the Superchat workspace (the Public API cannot create lists)`,
    );
  }
  return found;
}

/** Finds an existing contact by phone handle so we never create duplicates. */
export async function findContactByPhone(
  key: string,
  phone: string,
): Promise<string | null> {
  const { ok, data } = await sc(key, "POST", "/contacts/search?limit=1", {
    query: { value: [{ field: "phone", operator: "=", value: phone }] },
  });
  if (!ok) return null;
  const results = (data as { results?: Contact[] } | null)?.results ?? [];
  return results[0]?.id ?? null;
}

/** Ids of the lists a contact currently sits on. */
export async function listsForContact(
  key: string,
  contactId: string,
): Promise<string[]> {
  const { ok, data } = await sc(
    key,
    "GET",
    `/contacts/${contactId}/contact-lists?limit=100`,
  );
  if (!ok) return [];
  return ((data as { results?: ContactList[] } | null)?.results ?? []).map((l) => l.id);
}

export async function addContactToList(
  key: string,
  contactId: string,
  listId: string,
): Promise<void> {
  await sc(key, "POST", `/contacts/${contactId}/contact-lists`, { id: listId });
}

export async function removeContactFromList(
  key: string,
  contactId: string,
  listId: string,
): Promise<void> {
  await sc(key, "DELETE", `/contacts/${contactId}/contact-lists/${listId}`);
}
