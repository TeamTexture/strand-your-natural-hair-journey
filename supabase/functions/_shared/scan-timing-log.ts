// STEP 2 (2026-09-04) — instrument SUCCESSFUL scans, not just failures.
//
// `scan_errors` tells us why a scan blew up. This module records the other
// half: per-phase wall-clock timings for scans that finished, so we can see
// where a slow-but-successful scan actually spends its time and how many
// manuscript retrieval round-trips it makes.
//
// Hard rules (same as scan-error-log.ts):
//  - Never throws, never awaited on the member's critical path.
//  - Never records member content: no photo bytes, no analysis text, no
//    ingredient names — only counts and durations.
//  - Changes nothing about the analysis, the prompt or the grounding rules.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface ScanTimingRecord {
  /** Edge function that ran, e.g. "product-analyse". */
  function_name: string;
  /** Surface key, e.g. "product-analyse" / "product-analyse-url". */
  surface?: string | null;
  user_id?: string | null;
  /** Label read: time from request start until the label was resolved. */
  ocr_ms?: number | null;
  /** Total time spent in manuscript retrieval round-trips. */
  retrieval_ms?: number | null;
  /** Model generation + guardrail loop. */
  analysis_ms?: number | null;
  /** Whole request, start to response. */
  total_ms?: number | null;
  ingredient_count?: number | null;
  /** Manuscript retrieval round-trips spent by this request. */
  retrieval_call_count?: number | null;
  /** Guardrail-loop attempts the answer took. */
  attempts?: number | null;
  cache_hit?: boolean;
  /** CPU milliseconds (user + system) the isolate burned on this request. */
  cpu_ms?: number | null;
  /** Same figure as a percentage of the worker CPU limit — the headroom read. */
  cpu_pct_of_limit?: number | null;
  /** Free-form extras (provider, health tier…). Never content. */
  meta?: Record<string, unknown> | null;
}

const round = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;

/** Write one row to public.scan_timings. Fire-and-forget; never throws. */
export async function logScanTiming(record: ScanTimingRecord): Promise<void> {
  console.log(JSON.stringify({ event: "scan_timing", ...record }));
  // Deno Deploy does not implement process.cpuUsage(), so CPU percentage is
  // not a trustworthy alert. 42s is 70% of the 60s request envelope.
  if (typeof record.total_ms === "number" && record.total_ms >= 42_000) {
    console.warn(
      `[scan-timing] ${record.function_name}: wall time ${record.total_ms}ms = ${Math.round((record.total_ms / 60_000) * 100)}% of the request envelope`,
    );
  }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("scan_timings").insert({
      function_name: record.function_name,
      surface: record.surface ?? record.function_name,
      user_id: record.user_id ?? null,
      ocr_ms: round(record.ocr_ms),
      retrieval_ms: round(record.retrieval_ms),
      analysis_ms: round(record.analysis_ms),
      total_ms: round(record.total_ms),
      ingredient_count: round(record.ingredient_count),
      retrieval_call_count: round(record.retrieval_call_count),
      attempts: round(record.attempts),
      cache_hit: record.cache_hit ?? false,
      cpu_ms: round(record.cpu_ms),
      cpu_pct_of_limit: typeof record.cpu_pct_of_limit === "number" &&
          Number.isFinite(record.cpu_pct_of_limit)
        ? record.cpu_pct_of_limit
        : null,
      meta: record.meta ?? null,
    });
  } catch (e) {
    console.error(
      `[scan-timing-log] could not record timings: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}
