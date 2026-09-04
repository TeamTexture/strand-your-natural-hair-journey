/**
 * TWO-PHASE PRODUCT SCAN — client side of the background analysis (2026-09-04).
 *
 * Phase A (`product-label-read`) identifies the product and reads the panel in a
 * few seconds. Phase B — the grounded, guarded, scored analysis — runs in its
 * OWN edge invocation, started by `product-analysis-start` and kept alive
 * server-side. Nothing here holds it open: closing the app, changing screen or
 * losing signal cannot interrupt it, and coming back never restarts finished
 * work because the result is read from storage.
 *
 * The job row lives in `ai_summaries` under kind `analysis_job:<productKey>`.
 */

import { supabase } from "@/integrations/supabase/client";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

export const analysisJobKind = (productKey: string) => `analysis_job:${productKey}`;

export interface AnalysisJob {
  status: "running" | "complete" | "failed";
  started_at?: string;
  finished_at?: string | null;
  ingredient_count?: number;
  attempts?: number;
  error?: string | null;
}

/** Start (or explicitly retry) the background analysis. Never throws. */
export async function startProductAnalysis(
  productKey: string,
  opts: { force?: boolean } = {},
): Promise<{ started: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("product-analysis-start", {
      body: { productKey, force: !!opts.force },
    });
    if (error) {
      const { memberSafeMessage } = await import("@/lib/invokeError");
      return { started: false, message: memberSafeMessage(error, "We couldn't start the analysis just yet.") };
    }
    return { started: true, message: (data as { status?: string } | null)?.status };
  } catch (e) {
    console.warn("[analysisJob] start failed", e);
    return { started: false, message: "We couldn't start the analysis just yet." };
  }
}

/** Read the current job state for a product. Returns null when none exists. */
export async function readAnalysisJob(productKey: string): Promise<AnalysisJob | null> {
  try {
    const { data: userData } = await getDisplayedAuthUser();
    const uid = userData?.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from("ai_summaries")
      .select("payload")
      .eq("user_id", uid)
      .eq("kind", analysisJobKind(productKey))
      .maybeSingle();
    const payload = (data as { payload?: unknown } | null)?.payload;
    if (!payload || typeof payload !== "object") return null;
    const job = payload as AnalysisJob;
    return job.status ? job : null;
  } catch {
    return null;
  }
}
