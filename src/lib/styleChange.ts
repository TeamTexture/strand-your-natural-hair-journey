// STYLE CHANGE — one place that saves the member's current style and makes
// every style-dependent surface regenerate.
//
// WHY (2026-09-05): the style could be changed from three places (Current
// Hairstyle, the post-wash prompt, and now the wash day log) and each one did
// its own partial invalidation. Guidance written for a style she no longer wore
// kept rendering, and one card described two styles at once.
//
// Every caller now goes through `saveCurrentStyle`, which:
//   1. writes user_style_profile (current style + style_set_at = now, so
//      "day N in rotation" counts from the NEW style),
//   2. drops the clinical-context cache,
//   3. clears every stale-while-revalidate "last good" guidance payload, so a
//      surface shows its honest updating state instead of the old style's copy,
//   4. invalidates the React Query keys of every style-dependent surface,
//   5. dispatches `strand:style-updated` + `strand:data-changed`.
//
// The cache SIGNATURES themselves also carry the style: `styleTokenOf`
// (tip surfaces) and `currentProfileHash` (product / ingredient analysis),
// so the invalidation cannot drift again even without this helper.

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearAllLastGood } from "@/lib/lastGoodTip";
import { invalidateClinicalContextCache } from "@/lib/clinicalContext";
import { styleAsksTension, styleAsksExtensions } from "@/lib/hairstyles";

/** Query keys of every surface whose guidance depends on the current style. */
export const STYLE_DEPENDENT_QUERY_KEYS: string[] = [
  "current-style-token",
  "style_tip_v1",
  "style_tip_v2_procedural",
  "wash_day_tip_v1",
  "wash_day_tip_v4_reason",
  "wash_day_steps_v1",
  "wash_day_steps_v2",
  "goal-tip",
  "goal-steps",
  "strand-summary",
  "nutrition-plan",
  "ingredient-explainer",
  "product-analysis",
  "passport",
  "style-card-photo",
];

export interface StyleSaveInput {
  userId: string;
  style: string;
  tension?: string | null;
  extensions?: boolean | null;
}

/**
 * Persist the member's new current style. Throws on failure — never report
 * success on a failed save (the saved style drives every personalised surface).
 */
export async function saveCurrentStyle({
  userId,
  style,
  tension = null,
  extensions = null,
}: StyleSaveInput): Promise<void> {
  const { error } = await supabase.from("user_style_profile").upsert(
    {
      user_id: userId,
      current_hairstyle: style,
      current_style_tension: styleAsksTension(style) ? tension : null,
      current_style_extensions: styleAsksExtensions(style) ? extensions : null,
      // The rotation count restarts from this style, not the previous one.
      style_set_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/**
 * Tell the whole app the style changed: drop stale guidance and refetch.
 * Safe to call with no QueryClient (event listeners still fire).
 */
export function announceStyleChange(qc?: QueryClient) {
  invalidateClinicalContextCache();
  clearAllLastGood();
  if (qc) {
    for (const key of STYLE_DEPENDENT_QUERY_KEYS) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }
  window.dispatchEvent(new Event("strand:style-updated"));
  window.dispatchEvent(new Event("strand:data-changed"));
}
