// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@17";

export const STRAND_PLUS_LOOKUP_KEY = "strand_plus_monthly";

const PLUS_AMOUNT = 1499;
const PLUS_CURRENCY = "gbp";
const PLUS_INTERVAL = "month";

/**
 * Resolves the STRAND+ price id.
 * NEVER creates a Stripe price — the configured id must be valid.
 */
export async function resolveStrandPlusPriceId(
  stripe: Stripe,
  configuredPriceId: string,
) {
  const configured = await retrievePrice(stripe, configuredPriceId);
  if (!configured) {
    throw new Error("The configured STRIPE_PLUS_PRICE_ID is invalid — it could not be retrieved from Stripe.");
  }
  return configured.id;
}

export async function priceIsStrandPlus(stripe: Stripe, priceId: string | null) {
  const price = await retrievePrice(stripe, priceId);
  return isStrandPlusPrice(price);
}

export async function retrievePrice(stripe: Stripe, priceId: string | null) {
  if (!priceId) return null;
  try {
    return await stripe.prices.retrieve(priceId);
  } catch (_error) {
    return null;
  }
}

export function isStrandPlusPrice(price: Stripe.Price | null) {
  return !!price &&
    price.active !== false &&
    price.currency === PLUS_CURRENCY &&
    price.unit_amount === PLUS_AMOUNT &&
    price.recurring?.interval === PLUS_INTERVAL &&
    (price.lookup_key === STRAND_PLUS_LOOKUP_KEY || price.metadata?.tier === "plus");
}
