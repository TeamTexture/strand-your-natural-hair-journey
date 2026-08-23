import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InternationalBlockState {
  /** Account has been flagged as outside the UK — show the blocking splash. */
  blocked: boolean;
  /** Detected country name (or ISO code) for the splash copy. */
  country: string | null;
  /** True while we still don't know (first-entry geo check in flight). */
  isLoading: boolean;
}

/**
 * Reads the STORED account flag — we never re-geo-check an existing member
 * (a UK member abroad must not be locked out). A fresh IP check runs exactly
 * once per account, immediately after registration, via the
 * `international-check` edge function; every later login reads the flag.
 */
export const useInternationalBlock = (): InternationalBlockState => {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const checking = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["international-block", user?.id],
    enabled: !!user && !loading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("international_block, international_country, geo_checked_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return {
        blocked: !!data?.international_block,
        country: data?.international_country ?? null,
        checked: !!data?.geo_checked_at,
      };
    },
  });

  // Brand-new account: run the one-and-only IP check before onboarding starts.
  useEffect(() => {
    if (!user || !data || data.checked || checking.current) return;
    checking.current = true;
    (async () => {
      try {
        await supabase.functions.invoke("international-check", { body: {} });
      } catch (e) {
        console.error("[geo] international-check failed", e);
      } finally {
        await qc.invalidateQueries({ queryKey: ["international-block", user.id] });
        checking.current = false;
      }
    })();
  }, [user, data, qc]);

  return {
    blocked: !!data?.blocked,
    country: data?.country ?? null,
    // Unchecked accounts are still "loading" so onboarding never flashes first.
    isLoading: isLoading || (!!user && !!data && !data.checked),
  };
};
