import { supabase } from "@/integrations/supabase/client";

/**
 * NEVER LOSE FINISHED WORK (2026-09-04).
 *
 * Both streaming scans persist the finished, fully guarded analysis under a
 * recovery key derived from a client-generated scan id, BEFORE the `complete`
 * event is emitted. If the stream drops in the last stretch — proxy idle
 * timeout, worker shutdown, phone losing signal — the finished analysis is
 * still on the server, so we fetch it instead of failing the member.
 *
 * Only the guarded payload is ever stored under this key: never a partial,
 * never a preview.
 */
export const scanRecoveryKind = (scanId: string) => `scan_recovery:${scanId}`;

export async function fetchScanRecovery(
  scanId: string,
  opts?: { attempts?: number; gapMs?: number },
): Promise<Record<string, unknown> | null> {
  const attempts = opts?.attempts ?? 6;
  const gapMs = opts?.gapMs ?? 2500;
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabase
      .from("ai_summaries")
      .select("payload")
      .eq("kind", scanRecoveryKind(scanId))
      .maybeSingle();
    const payload = data?.payload as Record<string, unknown> | null | undefined;
    // A recoverable result always carries the product identity; anything
    // thinner is not a finished analysis and must not be used.
    if (payload && (payload.product_name || payload.brand)) return payload;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return null;
}
