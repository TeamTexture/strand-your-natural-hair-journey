// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@17";

export const STRAND_PLUS_LOOKUP_KEY = "strand_plus_monthly";

const PLUS_AMOUNT = 1499;
const PLUS_CURRENCY = "gbp";
const PLUS_INTERVAL = "month";

export async function resolveStrandPlusPriceId(
  stripe: Stripe,
  configuredPriceId: string,
  fallbackPriceId?: string | null,
) {
  const configured = await retrievePrice(stripe, configuredPriceId);
  if (isStrandPlusPrice(configured)) return configured.id;

  const existing = await stripe.prices.list({
    active: true,
    lookup_keys: [STRAND_PLUS_LOOKUP_KEY],
    limit: 1,
  });
  const existingPlus = existing.data.find(isStrandPlusPrice);
  if (existingPlus) return existingPlus.id;

  const fallback = await retrievePrice(stripe, fallbackPriceId ?? null);
  const product = priceProductId(configured) ?? priceProductId(fallback);

  const params: Stripe.PriceCreateParams = {
    currency: PLUS_CURRENCY,
    unit_amount: PLUS_AMOUNT,
    recurring: { interval: PLUS_INTERVAL },
    lookup_key: STRAND_PLUS_LOOKUP_KEY,
    metadata: { tier: "plus" },
  };

  if (product) {
    params.product = product;
  } else {
    params.product_data = { name: "STRAND+ membership" };
  }

  const created = await stripe.prices.create(params);
  return created.id;
}

export async function priceIsStrandPlus(stripe: Stripe, priceId: string | null) {
  const price = await retrievePrice(stripe, priceId);
  return isStrandPlusPrice(price);
}

async function retrievePrice(stripe: Stripe, priceId: string | null) {
  if (!priceId) return null;
  try {
    return await stripe.prices.retrieve(priceId);
  } catch (_error) {
    return null;
  }
}

function isStrandPlusPrice(price: Stripe.Price | null) {
  return !!price &&
    price.active !== false &&
    price.currency === PLUS_CURRENCY &&
    price.unit_amount === PLUS_AMOUNT &&
    price.recurring?.interval === PLUS_INTERVAL &&
    (price.lookup_key === STRAND_PLUS_LOOKUP_KEY || price.metadata?.tier === "plus");
}

function priceProductId(price: Stripe.Price | null) {
  if (!price?.product) return null;
  return typeof price.product === "string" ? price.product : price.product.id;
}