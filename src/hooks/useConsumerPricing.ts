import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const KEYS = ["consumer_monthly_price_gbp", "consumer_plus_monthly_price_gbp"] as const;

const toNumber = (raw: unknown, fallback: number) => {
  const n = typeof raw === "string" ? parseFloat(raw) : (raw as number);
  return typeof n === "number" && isFinite(n) ? n : fallback;
};

/**
 * The single source of truth for consumer membership pricing.
 *
 * Both the membership page and the trial paywall read from here, so a price
 * change in `platform_settings` moves every screen at once and no screen ever
 * hardcodes an amount.
 */
export function useConsumerPricing() {
  const q = useQuery({
    queryKey: ["platform_settings", "consumer_pricing"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", KEYS as unknown as string[]);
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        standard: toNumber(map.get("consumer_monthly_price_gbp"), 9.99),
        plus: toNumber(map.get("consumer_plus_monthly_price_gbp"), 14.99),
      };
    },
  });

  return {
    standard: q.data?.standard ?? 9.99,
    plus: q.data?.plus ?? 14.99,
    isLoading: q.isLoading,
  };
}

/** £9.99 */
export const formatGbp = (n: number) =>
  `£${n.toFixed(2).replace(/\.00$/, ".00")}`;
