import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { PRO_PROFILE_KEY } from "@/lib/proProfileCache";

export type ProProfileRow = Database["public"]["Tables"]["pro_profiles"]["Row"];
export type ProReviewStatus =
  Database["public"]["Enums"]["pro_profile_review_status"];

/**
 * The signed-in professional's own profile + review status.
 *
 * POLICY (Paige): approval is a ONE-TIME gate at application stage. Profile
 * edits NEVER re-enter review — a saved profile publishes immediately. The
 * only remaining gate is completeness (draft → finish setup); `underReview`
 * is retained for legacy rows but never blocks the portal.
 */
export function useMyProProfile() {
  // Effective identity: in admin Shadow View this resolves the impersonated
  // professional's own profile, so gating matches what they actually see.
  const { user } = useAuth();
  const q = useQuery({
    // SHARED key with the edit screen: one row, one cache entry, so a save in
    // /pro/profile is reflected on the dashboard and every gate immediately.
    queryKey: PRO_PROFILE_KEY(user?.id),
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ProProfileRow | null> => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ProProfileRow | null) ?? null;
    },
  });

  const profile = q.data ?? null;
  const status: ProReviewStatus | null = profile
    ? (profile.profile_review_status as ProReviewStatus)
    : null;

  return {
    profile,
    status,
    needsSetup: status === "draft" || status === "changes_requested",
    // Never gate on review any more — edits publish instantly.
    underReview: false,
    approved: status !== "draft",
    /** Setup is done: the profile has been submitted, published or approved.
     * Once true the acceptance/"you've been accepted" screen must never show. */
    setupComplete:
      !!profile &&
      (!!profile.submitted_at ||
        profile.is_published === true ||
        status === "submitted" ||
        status === "approved"),
    reviewNote: profile?.review_note ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

/** Admin: professionals waiting for profile approval. */
export function usePendingProProfileReviews() {
  return useQuery({
    queryKey: ["admin", "pro-profile-reviews"],
    queryFn: async (): Promise<ProProfileRow[]> => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .select("*")
        .eq("profile_review_status", "submitted")
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProProfileRow[];
    },
  });
}

/** Admin badge count of profiles awaiting review. */
export function usePendingProProfileReviewCount() {
  return useQuery({
    queryKey: ["admin", "pro-profile-reviews", "count"],
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pro_profiles")
        .select("id", { count: "exact", head: true })
        .eq("profile_review_status", "submitted");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
