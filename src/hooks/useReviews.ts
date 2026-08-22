import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ReviewStatus = "pending" | "approved" | "denied";

export interface ProReview {
  id: string;
  appointment_id: string;
  client_user_id: string;
  rating: number;
  body_text: string | null;
  audio_path: string | null;
  transcription_text: string | null;
  status: ReviewStatus;
  created_at: string;
  decided_at: string | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  body_text: string | null;
  audio_path: string | null;
  transcription_text: string | null;
  created_at: string;
  reviewer_label: string;
  service: string | null;
}

export interface ReviewSummary {
  professional_id: string;
  avg_rating: number;
  review_count: number;
}

/** Reviews written about the signed-in professional (all statuses). */
export function useProReviews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pro-reviews", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ProReview[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id,appointment_id,client_user_id,rating,body_text,audio_path,transcription_text,status,created_at,decided_at",
        )
        .eq("professional_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProReview[];
    },
  });
}

/**
 * The signed-in member's own reviews, keyed by appointment id. Used to decide
 * whether a past appointment still needs a "Leave a review" prompt — RLS scopes
 * this to the member's own rows, so a professional's decision status is only
 * ever visible for reviews they wrote themselves.
 */
export function useMyReviewsByAppointment() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-reviews", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, { id: string; rating: number; status: ReviewStatus }>> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,appointment_id,rating,status")
        .eq("client_user_id", user!.id);
      if (error) throw error;
      const map = new Map<string, { id: string; rating: number; status: ReviewStatus }>();
      for (const r of (data ?? []) as any[]) {
        map.set(r.appointment_id, { id: r.id, rating: r.rating, status: r.status });
      }
      return map;
    },
  });
}


/** Approve or deny a review. Decisions are final. */
export function useDecideReview() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "denied" }) => {
      const { error } = await supabase
        .from("reviews")
        .update({ status })
        .eq("id", id)
        .eq("professional_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-reviews"] });
      qc.invalidateQueries({ queryKey: ["review-summaries"] });
      qc.invalidateQueries({ queryKey: ["public-reviews"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Aggregate approved-review ratings for a set of professionals. Returns a map
 * keyed by pro user id; pros with no approved reviews are simply absent so the
 * UI can render nothing rather than empty stars.
 */
export function useReviewSummaries(proIds: string[]) {
  const ids = [...new Set(proIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["review-summaries", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, ReviewSummary>> => {
      const { data, error } = await (supabase.rpc as any)("pro_review_summary", {
        _pro_ids: ids,
      });
      if (error) throw error;
      const map = new Map<string, ReviewSummary>();
      for (const row of (data ?? []) as any[]) {
        map.set(row.professional_id, {
          professional_id: row.professional_id,
          avg_rating: Number(row.avg_rating),
          review_count: Number(row.review_count),
        });
      }
      return map;
    },
  });
}

const PAGE_SIZE = 10;

/** Public (approved-only, PII-safe) reviews for one professional. */
export function usePublicReviews(proUserId: string | null | undefined, page = 0, limit = PAGE_SIZE) {
  return useQuery({
    queryKey: ["public-reviews", proUserId, page, limit],
    enabled: !!proUserId,
    queryFn: async (): Promise<PublicReview[]> => {
      const { data, error } = await (supabase.rpc as any)("pro_public_reviews", {
        _pro: proUserId,
        _limit: limit,
        _offset: page * limit,
      });
      if (error) throw error;
      return (data ?? []) as PublicReview[];
    },
  });
}

export const REVIEWS_PAGE_SIZE = PAGE_SIZE;

/** Signs a private review-audio path for playback. */
export async function signReviewAudio(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("review-audio").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
