// UI-layer feature flags. Nothing here touches the backend — each flag only
// controls whether a surface is rendered, so flipping one back is a one-line
// change with no migration, no redeploy and no data implications.

/**
 * The personalised "Strand tip" card on the member home feed.
 *
 * Hidden Aug 2026 at Paige's request. The engine behind it is untouched and
 * fully live: `useGoalTip`, the tip signature/cache in `src/lib/tipSignature.ts`
 * and the `goal-tip` edge function all still exist and still work. While this
 * is `false` Home does not render the card and does not request a tip (so the
 * hidden card costs no model spend). Set it back to `true` to restore.
 */
export const SHOW_STRAND_TIP = false;
