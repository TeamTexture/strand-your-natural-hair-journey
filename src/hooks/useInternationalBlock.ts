import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InternationalBlockState {
  /** Account has been flagged as outside the UK — show the blocking splash. */
  blocked: boolean;
  /** The country the member declared, for the splash copy. */
  country: string | null;
  /** True while the stored flag is still being read. */
  isLoading: boolean;
}

/**
 * Reads the STORED account flag only. The decision is made ONCE, from the
 * country the member declares on the first page of the hair/blood section —
 * there is no IP geolocation anywhere, and the flag is never re-evaluated on
 * later logins.
 */
export const useInternationalBlock = (): InternationalBlockState => {
  const { user, loading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["international-block", user?.id],
    enabled: !!user && !loading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("international_block, international_country")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return {
        blocked: !!data?.international_block,
        country: data?.international_country ?? null,
      };
    },
  });

  return {
    blocked: !!data?.blocked,
    country: data?.country ?? null,
    isLoading: isLoading && !!user,
  };
};
