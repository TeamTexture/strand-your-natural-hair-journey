// Advert placement pricing — SINGLE SOURCE OF TRUTH.
//
// Every rate and total shown to a brand (campaign designer, placement calendar,
// cost summary, confirmation screens) reads from this module. Nothing else may
// hardcode a rate.
//
// Broad and targeted rates are stored EXPLICITLY per slot. No targeted rate is
// derived from a broad rate — the uplift is not uniform (pro_welcome is a
// smaller uplift than the others, deliberately, confirmed by Paige).
//
// IMPORTANT: rates here are only used to PRICE A NEW BOOKING. Once a campaign is
// booked, the rate is snapshotted onto brand_offer_placements.daily_rate_pence and
// every displayed/charged cost reads that stored value — so changing the numbers
// below never re-prices an existing booking.

export type PricedSlot = "home" | "products" | "wash_day" | "pro_welcome";

/** Broad (untargeted) rate per slot, per day, in pence. */
export const BROAD_DAILY_RATE_PENCE: Record<PricedSlot, number> = {
  home: 2000,
  products: 2000,
  // Wash day is the highest-intent surface.
  wash_day: 3000,
  pro_welcome: 3000,
};

/** Targeted rate per slot, per day, in pence. Explicit — never derived. */
export const TARGETED_DAILY_RATE_PENCE: Record<PricedSlot, number> = {
  home: 3000,
  products: 3000,
  wash_day: 4500,
  pro_welcome: 4000,
};

/** Introductory pricing while the first cohort is onboarded. */
export const IS_TRIAL_PRICING = true;
export const TRIAL_PRICING_ENDS = "2026-12-07";

export const TRIAL_PRICING_NOTE =
  "Introductory rates apply while STRAND is in its onboarding phase.";

/** Rate for one slot, for one day, in pence. */
export const dailyRatePence = (slot: PricedSlot, targeted: boolean): number =>
  targeted ? TARGETED_DAILY_RATE_PENCE[slot] : BROAD_DAILY_RATE_PENCE[slot];


export const money = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

export interface CostLine {
  slot: PricedSlot;
  days: number;
  ratePence: number;
  subtotalPence: number;
}

export interface CostBreakdown {
  targeted: boolean;
  days: number;
  lines: CostLine[];
  totalPence: number;
}

/** Full cost breakdown for an in-progress booking. */
export function buildCostBreakdown(
  slots: PricedSlot[],
  days: number,
  targeted: boolean,
): CostBreakdown {
  const lines = slots.map((slot) => {
    const ratePence = dailyRatePence(slot, targeted);
    return { slot, days, ratePence, subtotalPence: ratePence * days };
  });
  return {
    targeted,
    days,
    lines,
    totalPence: lines.reduce((sum, l) => sum + l.subtotalPence, 0),
  };
}
