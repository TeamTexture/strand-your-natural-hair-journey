// NEVER LOSE FINISHED WORK (2026-09-04)
// =====================================
// A photo scan has no productKey (the key is minted from the brand + name the
// model reads), so the finished analysis was only ever delivered on the SSE
// stream — nothing persisted it. If the stream dropped in the last second, a
// full model call's worth of finished, fully guarded analysis was thrown away
// and the member was shown a failure.
//
// Every streaming scan now writes the finished payload under a recovery key
// derived from a client-generated scan id, BEFORE the `complete` event is
// emitted. When the stream ends without `complete`, the client reads that row
// and shows the analysis instead of an error.
//
// The row is the same fully guarded payload `complete` carries — never a
// partial, never a preview.

// deno-lint-ignore no-explicit-any
type Client = any;

/** `ai_summaries.kind` for a recoverable scan result. */
export function scanRecoveryKind(scanId: string): string {
  return `scan_recovery:${scanId}`;
}

/** Accepts only a client-generated UUID — never used to build SQL. */
export function isValidScanId(id: unknown): id is string {
  return typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Persist the finished payload so a dropped connection cannot discard it.
 * Awaited (it must land before `complete`), but a failure here never fails the
 * scan — the stream still delivers the analysis.
 */
export async function saveScanRecovery(opts: {
  supabase: Client;
  userId: string;
  scanId: unknown;
  functionName: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  if (!isValidScanId(opts.scanId)) return false;
  const kind = scanRecoveryKind(opts.scanId);
  try {
    const { data: prior } = await opts.supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", opts.userId)
      .eq("kind", kind)
      .maybeSingle();
    if (prior?.id) {
      await opts.supabase.from("ai_summaries")
        .update({ payload: opts.payload as object, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await opts.supabase.from("ai_summaries").insert({
        user_id: opts.userId,
        kind,
        payload: opts.payload as object,
      });
    }
    console.log(JSON.stringify({
      function: opts.functionName,
      event: "scan_recovery_saved",
    }));
    return true;
  } catch (e) {
    console.warn(JSON.stringify({
      function: opts.functionName,
      event: "scan_recovery_save_failed",
      error_name: e instanceof Error ? e.name : "unknown",
    }));
    return false;
  }
}
