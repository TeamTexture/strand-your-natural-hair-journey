/**
 * Strict queue for the first-run prompts that can fire on /home.
 *
 * Order (never re-ordered, never overlapped):
 *   1. The guided home tour — alone, uninterrupted (see firstRunTour.ts and
 *      useFirstRunPromptsBlocked).
 *   2. The personalised-offers consent card — only once the tour is completed
 *      or skipped.
 *   3. Everything else (photo prompt, product prompt, profile reconfirm, and
 *      any future goals / hair-length asks) — only once the offers card has
 *      been answered or dismissed, and only ONE of them per session.
 *
 * This module holds the session-level state for tiers 2 and 3. Nothing here
 * changes what a prompt asks or what it writes — only whose turn it is.
 */

export const OFFERS_DONE_EVENT = "strand:offers-card-done";

let offersAnswered = false;

/** True once the offers card has been answered or dismissed this session. */
export const offersCardDone = () => offersAnswered;

/** Called by the offers card on either answer and on dismiss. */
export const markOffersCardDone = () => {
  offersAnswered = true;
  window.dispatchEvent(new Event(OFFERS_DONE_EVENT));
};

/**
 * Tier 3 is a single slot. The first eligible prompt to claim it owns it for
 * the rest of the session, so a member is never shown three asks in one sitting.
 */
let slotOwner: string | null = null;
export const lateSlotOwner = () => slotOwner;
export const claimLateSlot = (id: string): boolean => {
  if (slotOwner === null) slotOwner = id;
  return slotOwner === id;
};
