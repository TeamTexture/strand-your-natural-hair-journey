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
