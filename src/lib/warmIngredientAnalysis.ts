// POST-SCAN WARM-UP (2026-09-01).
//
// A freshly scanned product used to reach the member with the scan verdict only:
// `ingredient-analysis` is the surface that produces the per-ingredient cards,
// the "how to use this for your hair" guidance and the manuscript-RAG
// personalisation, and the analysis gate (correctly) sees a stored score on the
// new row and serves it, so that second pass never ran until some later profile
// change. Established shelf products had it; a brand-new scan did not.
//
// This fires that pass once, in the background, immediately after the scan row is
// written. It is deliberately fire-and-forget: the member is already being routed
// to the product page, the scan verdict renders from nav state, and this only
// fills in what the page reads afterwards. It never blocks navigation, never
// surfaces an error to the member, and goes through the same gate vocabulary as
// every other call site (`no_stored_analysis`).

import { supabase } from "@/integrations/supabase/client";
import { assertAnalysisTrigger } from "@/lib/analysisGate";
import { isViewAsReadOnly } from "@/lib/viewAsReadOnly";

export interface WarmIngredientAnalysisInput {
  productKey: string;
  productName: string;
  productBrand?: string | null;
  ingredients?: string[] | null;
  category?: string | null;
  applicationArea?: string | null;
  leaveOn?: boolean | null;
  usageInstructions?: string | null;
  hairProfile?: unknown;
  healthProfile?: unknown;
  heritage?: unknown;
  context?: unknown;
}

/** Fire-and-forget. Resolves once the call settles; callers need not await. */
export async function warmIngredientAnalysis(
  input: WarmIngredientAnalysisInput,
): Promise<void> {
  // An admin viewing the app as a member must never spend a model call or write
  // an analysis row as that member.
  if (isViewAsReadOnly()) return;
  if (!input.productKey || !input.productName) return;

  const trigger = assertAnalysisTrigger("no_stored_analysis");
  try {
    const { error } = await supabase.functions.invoke("ingredient-analysis", {
      body: {
        productKey: input.productKey,
        productName: input.productName,
        productBrand: input.productBrand ?? null,
        trigger,
        ingredients: input.ingredients ?? undefined,
        category: input.category ?? null,
        applicationArea: input.applicationArea ?? null,
        leaveOn: input.leaveOn ?? null,
        usageInstructions: input.usageInstructions ?? null,
        isHomemade: false,
        hairProfile: input.hairProfile ?? {},
        healthProfile: input.healthProfile ?? {},
        heritage: input.heritage ?? [],
        context: input.context ?? null,
        force: false,
      },
    });
    if (error) console.warn("[warm-ingredient-analysis] failed", error);
  } catch (e) {
    console.warn("[warm-ingredient-analysis] threw", e);
  }
}
