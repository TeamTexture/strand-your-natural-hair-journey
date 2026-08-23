import { supabase } from "@/integrations/supabase/client";

export type GeoResult = {
  /** ISO-3166 alpha-2, or null when detection was inconclusive. */
  country: string | null;
  source: string;
  /** true when the lookup itself failed (network/function down) — we fail OPEN. */
  failed?: boolean;
};

const CACHE_KEY = "strand.geo";

export const UK_CODES = new Set(["GB", "UK", "GG", "JE", "IM"]);

export const isUk = (code: string | null | undefined) =>
  !!code && UK_CODES.has(code.toUpperCase());

/** Visitor said "I'm in the UK" on the waitlist splash — remember for this tab. */
const OVERRIDE_KEY = "strand.geoOverride";
export const setUkOverride = () => {
  try {
    sessionStorage.setItem(OVERRIDE_KEY, "1");
  } catch { /* private mode */ }
};
export const hasUkOverride = () => {
  try {
    return sessionStorage.getItem(OVERRIDE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Best-effort IP country detection. Cached per tab so we make one call per
 * session. VPNs, corporate proxies and mobile carriers can all misreport —
 * this is a soft gate, never a guarantee.
 */
export async function detectCountry(): Promise<GeoResult> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as GeoResult;
  } catch { /* ignore */ }

  let result: GeoResult;
  try {
    const { data, error } = await supabase.functions.invoke("geo-country", { body: {} });
    if (error) throw error;
    result = {
      country: typeof data?.country === "string" ? data.country.toUpperCase() : null,
      source: typeof data?.source === "string" ? data.source : "unknown",
    };
  } catch (e) {
    console.error("[geo] detection failed", e);
    // Fail open: never lock people out because our own lookup is down.
    result = { country: null, source: "error", failed: true };
  }

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch { /* ignore */ }
  return result;
}
