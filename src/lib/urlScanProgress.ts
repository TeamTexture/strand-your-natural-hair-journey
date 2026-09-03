// LIVE PROGRESS FOR PASTED-LINK SCANS (2026-09-03)
// ================================================
// A pasted product link takes the same length of pipeline as a photo scan
// (measured p50 56.7s, p90 71.5s) but showed nothing beyond a small button
// spinner, so it read as a hang. The link scan now streams (see
// streamProductAnalyse with fn: "product-analyse-url") and publishes what has
// arrived to this tiny store.
//
// A store rather than hook state because seven different surfaces start a link
// scan; one subscriber mounted in App renders the progress for all of them, so
// no caller has to change.

import type { PartialAnalysis } from "@/lib/streamProductAnalyse";

export interface UrlScanProgressState {
  active: boolean;
  startedAt: number | null;
  /** PREVIEW ONLY — never saved or scored. */
  partial: PartialAnalysis | null;
}

const initial: UrlScanProgressState = { active: false, startedAt: null, partial: null };
let state: UrlScanProgressState = initial;
const listeners = new Set<() => void>();

function set(next: UrlScanProgressState) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeUrlScanProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUrlScanProgress(): UrlScanProgressState {
  return state;
}

export function startUrlScanProgress() {
  set({ active: true, startedAt: Date.now(), partial: null });
}

export function setUrlScanPartial(partial: PartialAnalysis) {
  if (!state.active) return;
  set({ ...state, partial });
}

export function endUrlScanProgress() {
  set(initial);
}
