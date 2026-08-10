import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * MEMBER-INITIATED SHARING.
 *
 * A member can tag a professional into one of their own plans so that
 * professional can follow the progress. Two decisions stay separate, exactly as
 * they do for professional-sent plans: the share itself (the plan, the ticks,
 * the check-ins) and media sharing (photos, videos, voice notes). Turning media
 * sharing off only revokes access — nothing recorded is ever deleted.
 */

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  functions: { invoke: (n: string, o?: any) => Promise<{ data: any; error: any }> };
};

export type ShareStatus = "pending" | "accepted" | "declined" | "revoked";

export interface PlanShareRow {
  id: string;
  plan_id: string;
  professional_user_id: string | null;
  invited_name: string | null;
  invited_email: string | null;
  status: ShareStatus;
  share_media: boolean;
  media_revoked_at: string | null;
  created_at: string;
}

export interface ProSearchResult {
  user_id: string;
  display_name: string;
  discipline: string | null;
  city: string | null;
}

const SELECT =
  "id, plan_id, professional_user_id, invited_name, invited_email, status, share_media, media_revoked_at, created_at";

/** Everyone the member has tagged into this plan. */
export function usePlanShares(planId?: string) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["treatment-plan-shares", user?.id, planId],
    enabled: !!user?.id && !!planId,
    staleTime: 15_000,
    queryFn: async (): Promise<PlanShareRow[]> => {
      const { data, error } = await db
        .from("treatment_plan_shares")
        .select(SELECT)
        .eq("plan_id", planId)
        .neq("status", "revoked")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanShareRow[];
    },
  });
  return { shares: q.data ?? [], loading: q.isLoading };
}

/** Search professionals already listed on STRAND. */
export function useProSearch(term: string) {
  const trimmed = term.trim();
  const q = useQuery({
    queryKey: ["treatment-pro-search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<ProSearchResult[]> => {
      const { data, error } = await db.rpc("treatment_pro_search", { _q: trimmed });
      if (error) throw error;
      return (data ?? []) as ProSearchResult[];
    },
  });
  return { results: q.data ?? [], loading: q.isFetching };
}

export function usePlanShareActions(planId?: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["treatment-plan-shares", user?.id, planId] });
  };

  /** Tag a professional already on STRAND, or invite one by name and email. */
  const share = useMutation({
    mutationFn: async (v: {
      professionalUserId?: string | null;
      name: string;
      email?: string | null;
      shareMedia: boolean;
    }): Promise<PlanShareRow> => {
      if (!user?.id || !planId) throw new Error("missing_plan");
      const email = v.email?.trim().toLowerCase() || null;
      if (!v.professionalUserId && !email) throw new Error("no_target");
      const { data, error } = await db
        .from("treatment_plan_shares")
        .insert({
          plan_id: planId,
          owner_user_id: user.id,
          professional_user_id: v.professionalUserId ?? null,
          invited_name: v.name.trim() || null,
          invited_email: email,
          share_media: v.shareMedia,
        })
        .select(SELECT)
        .single();
      if (error) throw error;

      // Best effort — the invitation is live in-app either way.
      try {
        await db.functions.invoke("treatment-share-email", { body: { share_id: data.id } });
      } catch {
        /* ignore */
      }
      return data as PlanShareRow;
    },
    onSuccess: invalidate,
  });

  /** Reversible at any time. Turning it off keeps every recording. */
  const setShareMedia = useMutation({
    mutationFn: async (v: { shareId: string; on: boolean }) => {
      const { error } = await db
        .from("treatment_plan_shares")
        .update({ share_media: v.on })
        .eq("id", v.shareId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Remove their access. The plan and everything recorded stay untouched. */
  const revoke = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await db
        .from("treatment_plan_shares")
        .update({ status: "revoked", share_media: false })
        .eq("id", shareId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { share, setShareMedia, revoke };
}

export interface ShareDetail {
  id: string;
  status: ShareStatus;
  share_media: boolean;
  plan_id: string;
  plan_title: string | null;
  duration_weeks: number | null;
  start_date: string | null;
  step_count: number | null;
  member_name: string;
  invited_name: string | null;
}

/** The invited professional's view of one share, before they decide. */
export function useShareDetail(shareId?: string) {
  const q = useQuery({
    queryKey: ["treatment-share", shareId],
    enabled: !!shareId,
    staleTime: 10_000,
    queryFn: async (): Promise<ShareDetail | null> => {
      // Email invites resolve to an account on first sign-in.
      await db.rpc("claim_my_treatment_shares");
      const { data, error } = await db.rpc("treatment_share_detail", { _share_id: shareId });
      if (error) throw error;
      return (data ?? null) as ShareDetail | null;
    },
  });
  return { detail: q.data ?? null, loading: q.isLoading, refetch: q.refetch };
}

export function useShareResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { shareId: string; accept: boolean }) => {
      const { data, error } = await db.rpc("treatment_share_respond", {
        _share_id: v.shareId,
        _accept: v.accept,
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(String(data.error ?? "failed"));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["treatment-share"] });
      void qc.invalidateQueries({ queryKey: ["pro-treatment-clients"] });
    },
  });
}
