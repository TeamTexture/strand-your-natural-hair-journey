// JWT-gated auth helper. Replaces the ~9 inlined copies of:
//   const authHeader = req.headers.get("Authorization");
//   if (!authHeader) return 401;
//   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, ...);
//   const { data } = await supabase.auth.getUser();
//   if (!data?.user) return 401;
// across the legacy edge functions. Audit PHASE_2_AUDIT.md §4.5.

import {
  createClient,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { json } from "./cors.ts";

export interface AuthSuccess {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Returns either `{ user, supabase }` or a `Response` (401) the caller should
 * return directly. The supabase client is bound to the user's JWT so RLS
 * policies apply on subsequent reads.
 *
 * Usage:
 *   const auth = await requireAuthedUser(req);
 *   if (auth instanceof Response) return auth;
 *   const { user, supabase } = auth;
 */
export async function requireAuthedUser(
  req: Request,
): Promise<AuthSuccess | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing auth" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { error: "supabase env missing" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return json(401, { error: "unauthorized" });
  return { user: data.user, supabase };
}

/** True when the caller presented the service role key (server-to-server). */
export function isServiceRoleCaller(req: Request): boolean {
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!svc) return false;
  const header = req.headers.get("Authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const apikey = req.headers.get("apikey")?.trim() ?? "";
  return bearer === svc || apikey === svc;
}

/**
 * Allows trusted server-to-server calls (service role key) OR a signed-in user.
 * Returns `null` for a service-role caller, `{ user, supabase }` for a member,
 * or a 401 `Response` the caller should return directly.
 */
export async function requireServiceOrAuthedUser(
  req: Request,
): Promise<AuthSuccess | null | Response> {
  if (isServiceRoleCaller(req)) return null;
  return await requireAuthedUser(req);
}

/**
 * Allows trusted server-to-server calls (service role key) OR a signed-in
 * admin. Returns `null` for a service-role caller, `{ user, supabase }` for an
 * admin, or a 401/403 `Response`.
 */
export async function requireAdminOrService(
  req: Request,
): Promise<AuthSuccess | null | Response> {
  if (isServiceRoleCaller(req)) return null;
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { data, error } = await auth.supabase.rpc("has_role", {
    _user_id: auth.user.id,
    _role: "admin",
  });
  if (error || data !== true) return json(403, { error: "forbidden" });
  return auth;
}
