// PER-USER DAILY CALL CAPS — pure spend protection.
//
// Counts rows in `public.ai_call_log` (the Phase 2 cost meter) for this user +
// function over the last 24 hours and refuses the call once the limit is hit.
//
// Best effort by design: if the count query itself fails we log a warning and
// allow the call through. A broken meter must never lock a member out.
//
// Only call this on paths that are about to spend model tokens — skip it on
// cache-hit returns, since the cap is about model spend, not read volume.

import { json } from "./cors.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

export async function checkDailyCap(
  userId: string,
  functionName: string,
  limit: number,
): Promise<Response | null> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return null;

    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from("ai_call_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("function_name", functionName)
      .gt("created_at", since);

    if (error) throw new Error(error.message);

    if (typeof count === "number" && count >= limit) {
      console.log(
        JSON.stringify({
          event: "daily_cap_hit",
          function_name: functionName,
          user_id: userId,
          count,
          limit,
        }),
      );
      return json(429, {
        error: "You've hit today's limit for this feature. It resets in a few hours.",
      });
    }
    return null;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "daily_cap_check_failed",
        function_name: functionName,
        message: e instanceof Error ? e.message.slice(0, 160) : "unknown",
      }),
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE-WIDE DAILY AI CALL CEILING — automatic brake.
//
// The per-user cap stops one abusive account. It does NOT stop thousands of
// legitimate new accounts hitting AI functions at once (a mass email send).
// This ceiling counts EVERY row in `ai_call_log` in the last 24h across all
// users and all functions, and refuses further model spend once the limit is
// reached — no human has to notice and flip AI_KILL_SWITCH.
//
// Tuning: `AI_DAILY_GLOBAL_CAP` secret overrides the default. The count is
// cached in module memory for 60s so this adds at most one count query per
// warm isolate per minute.
//
// Best effort, same as the per-user cap: if the count query fails we allow the
// call. A broken meter must never take the whole app's AI offline.

const DEFAULT_GLOBAL_DAILY_CAP = 6000;
const GLOBAL_CACHE_MS = 60_000;

let globalCache: { count: number; at: number } | null = null;

export async function checkGlobalCeiling(functionName: string): Promise<Response | null> {
  const limit = Number(Deno.env.get("AI_DAILY_GLOBAL_CAP") ?? "") || DEFAULT_GLOBAL_DAILY_CAP;
  try {
    let count = globalCache && Date.now() - globalCache.at < GLOBAL_CACHE_MS
      ? globalCache.count
      : null;

    if (count === null) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!SUPABASE_URL || !SERVICE_ROLE) return null;

      // @ts-ignore — esm.sh URL import is Deno-native.
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: n, error } = await admin
        .from("ai_call_log")
        .select("id", { count: "exact", head: true })
        .gt("created_at", since);
      if (error) throw new Error(error.message);
      if (typeof n !== "number") return null;
      count = n;
      globalCache = { count, at: Date.now() };
    }

    if (count >= limit) {
      console.log(JSON.stringify({
        event: "global_ceiling_hit",
        function_name: functionName,
        count,
        limit,
      }));
      return json(503, {
        error:
          "STRAND's AI is unusually busy right now and has paused new requests for a short while. Please try again later.",
      });
    }
    return null;
  } catch (e) {
    console.warn(JSON.stringify({
      event: "global_ceiling_check_failed",
      function_name: functionName,
      message: e instanceof Error ? e.message.slice(0, 160) : "unknown",
    }));
    return null;
  }
}
