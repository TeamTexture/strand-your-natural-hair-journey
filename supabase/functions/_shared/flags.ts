// Per-function rollout flags. Strictly per-function — there is no
// "global" rollout flag anywhere in the codebase, by design (audit
// PHASE_2_AUDIT.md §5 Step 0). Each function reads its own flag from
// Deno.env at call time (NOT at module init), so flipping a flag in
// Lovable Cloud Secrets takes effect on the next invocation without
// a redeploy. Rollback is surgical, one function at a time.

export type AiProvider = "claude" | "lovable" | "parallel";

/** The 9 per-function flags. transcribe-audio stays on Gemini and has no flag. */
export const AI_PROVIDER_FLAG_NAMES = [
  "STRAND_AI_PROVIDER_INGREDIENT",
  "STRAND_AI_PROVIDER_PRODUCT_PHOTO",
  "STRAND_AI_PROVIDER_PRODUCT_URL",
  "STRAND_AI_PROVIDER_TOOL_URL",
  "STRAND_AI_PROVIDER_WASH_OBSERVATION",
  "STRAND_AI_PROVIDER_HEAT_RATIONALE",
  "STRAND_AI_PROVIDER_NUTRITION",
  "STRAND_AI_PROVIDER_BLOOD",
  "STRAND_AI_PROVIDER_JOURNAL",
] as const;

export type AiProviderFlagName = typeof AI_PROVIDER_FLAG_NAMES[number];

/** Read a per-function flag at call time. Default `lovable` until that
 *  function's migration step ships and Paige flips the flag. The
 *  `parallel` value is reserved for `_BLOOD` during the A/B verification
 *  window in §5 Step 7 — every other flag uses `claude` | `lovable` only. */
export function readAiProvider(flag: AiProviderFlagName): AiProvider {
  const v = Deno.env.get(flag);
  if (v === "claude" || v === "parallel") return v;
  return "lovable";
}
