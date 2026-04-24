/**
 * Light-tap haptic feedback. No-op on platforms without the Vibration API
 * (iOS Safari ignores it but won't error). Use for tag toggles, button taps,
 * and other transient confirmations.
 */
export function tap(durationMs: number = 10): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // Ignore — feature-detected only; some browsers throw if disabled.
  }
}

/** Slightly longer pulse for success confirmations (e.g. wash day saved). */
export function success(): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate([10, 40, 20]);
  } catch {
    // Ignore.
  }
}
