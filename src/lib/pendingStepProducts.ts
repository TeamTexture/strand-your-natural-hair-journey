/**
 * Products being analysed in the background for a style record step.
 *
 * A product pasted as a link is analysed by the AI, which takes time. Rather
 * than holding the member on a spinner, the pending item is recorded here so
 * the style record can show a placeholder tile with a progress bar, and the
 * member can leave and come back — the product attaches itself to the step as
 * soon as the analysis lands.
 */

const KEY = "strand.pendingStepProducts";
export const PENDING_EVENT = "strand:pending-step-products";
/** Typical analysis time — drives the progress bar, not the actual work. */
export const PENDING_ETA_MS = 30_000;

export interface PendingStepProduct {
  id: string;
  entryId: string;
  stepId: string;
  stepNumber: number;
  url: string;
  label: string;
  startedAt: number;
  failed?: boolean;
}

const read = (): PendingStepProduct[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PendingStepProduct[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const write = (list: PendingStepProduct[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full — the placeholder is cosmetic, carry on */
  }
  window.dispatchEvent(new CustomEvent(PENDING_EVENT));
};

/** Drops anything far past its ETA — a scan that never reported back. */
const fresh = (list: PendingStepProduct[]) =>
  list.filter((p) => Date.now() - p.startedAt < 10 * 60_000);

export const listPendingStepProducts = (entryId?: string) => {
  const list = fresh(read());
  return entryId ? list.filter((p) => p.entryId === entryId) : list;
};

export const addPendingStepProduct = (p: PendingStepProduct) => {
  write([...fresh(read()).filter((x) => x.id !== p.id), p]);
};

export const markPendingStepProductFailed = (id: string) => {
  write(fresh(read()).map((p) => (p.id === id ? { ...p, failed: true } : p)));
};

export const removePendingStepProduct = (id: string) => {
  write(fresh(read()).filter((p) => p.id !== id));
};

/** 0–0.95 while working; never completes on its own. */
export const pendingProgress = (p: PendingStepProduct) => {
  const elapsed = Date.now() - p.startedAt;
  return Math.min(0.95, elapsed / PENDING_ETA_MS);
};

/** Rough seconds left, floored at 1 while still working. */
export const pendingSecondsLeft = (p: PendingStepProduct) =>
  Math.max(1, Math.ceil((PENDING_ETA_MS - (Date.now() - p.startedAt)) / 1000));
