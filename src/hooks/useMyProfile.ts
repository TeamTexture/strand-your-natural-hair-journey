import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { withAuthLockRetry } from "@/lib/retryQuery";

export interface MyProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  postcode: string | null;
  tips_level: number | null;
  tips_level_prompted_at: string | null;
  access_restricted: boolean | null;
  complimentary_access: boolean | null;
  onboarding_completed_at: string | null;
  profile_confirmed_at: string | null;
  deletion_requested_at: string | null;
  payment_required_at: string | null;
}

const COLUMNS =
  "id, user_id, display_name, avatar_url, postcode, tips_level, tips_level_prompted_at, access_restricted, complimentary_access, onboarding_completed_at, profile_confirmed_at, deletion_requested_at, payment_required_at";

export const myProfileKey = (userId?: string) => ["my-profile", userId] as const;

/**
 * Single shared read of the signed-in user's `profiles` row.
 *
 * Home used to fire a dozen separate `profiles` selects (avatar, tips level,
 * access check, complimentary flag, display name…). They all share this one
 * cached query now, so the screen makes one request instead of twelve.
 */
export function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: myProfileKey(user?.id),
    enabled: !!user?.id,
    // Entitlement lives on this row (complimentary_access), so it revalidates
    // on focus — an access switch-off must be noticed in-session.
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,

    queryFn: async (): Promise<MyProfileRow | null> => {
      const { data, error } = await withAuthLockRetry(() =>
        supabase.from("profiles").select(COLUMNS).eq("user_id", user!.id).maybeSingle(),
      );
      if (error) throw error;
      return (data as MyProfileRow | null) ?? null;
    },
  });
}

/** Invalidate the shared profile row after a write (avatar, tips level, name). */
export function useInvalidateMyProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return () => qc.invalidateQueries({ queryKey: myProfileKey(user?.id) });
}
