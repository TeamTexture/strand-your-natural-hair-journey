import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BrandBloodPanel } from "@/lib/bloodTestBrands";

/**
 * Blood test brands — read through the EXISTING brand directory.
 *
 * Nothing is seeded and nothing is hardcoded. A brand only appears here once
 * (a) an admin has verified the at-home blood test capability and (b) the
 * brand's paid listing is currently active. Both conditions are enforced in RLS
 * as well, so a lapsed brand drops out of the flow automatically rather than
 * lingering behind a client-side filter.
 */

const PANELS = "brand_blood_panels" as never;

export const BLOOD_BRANDS_KEY = ["blood_test_brands"] as const;

/** Member-facing: verified, live brands with at least one active panel. */
export function useBloodTestBrandPanels() {
  const { data, isLoading } = useQuery({
    queryKey: [...BLOOD_BRANDS_KEY, "member"],
    staleTime: 60_000,
    queryFn: async (): Promise<BrandBloodPanel[]> => {
      // RLS already restricts this to verified + actively-subscribed brands.
      const { data: rows, error } = await supabase
        .from(PANELS)
        .select("*")
        .eq("is_active" as never, true as never)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const panels = (rows ?? []) as unknown as Array<Omit<BrandBloodPanel, "brand_name" | "logo_path">>;
      if (panels.length === 0) return [];

      const ids = Array.from(new Set(panels.map((p) => p.brand_user_id)));
      const { data: brands } = await supabase
        .from("brand_profiles")
        .select("user_id, brand_name, logo_path, offers_at_home_blood_tests_verified")
        .in("user_id", ids);
      const byUser = new Map(
        (brands ?? []).map((b) => [
          b.user_id,
          b as { brand_name: string | null; logo_path: string | null; offers_at_home_blood_tests_verified?: boolean },
        ]),
      );

      return panels
        // A panel whose brand row is unreadable/unverified never surfaces.
        .filter((p) => byUser.get(p.brand_user_id)?.offers_at_home_blood_tests_verified === true)
        .map((p) => ({
          ...p,
          brand_name: byUser.get(p.brand_user_id)?.brand_name ?? "Brand",
          logo_path: byUser.get(p.brand_user_id)?.logo_path ?? null,
        }));
    },
  });
  return { panels: data ?? [], loading: isLoading };
}

export type PanelDraft = {
  id?: string;
  panel_name: string;
  markers_covered: string[];
  price_from: number | null;
  currency: string;
  purchase_url: string;
  affiliate_url: string | null;
  regions_served: string[];
  is_active: boolean;
  sort_order: number;
};

/** Brand-facing: every panel the signed-in brand owns, active or not. */
export function useMyBloodPanels() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [...BLOOD_BRANDS_KEY, "mine", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from(PANELS)
        .select("*")
        .eq("brand_user_id" as never, user!.id as never)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (rows ?? []) as unknown as PanelDraft[];
    },
  });
  return { panels: data ?? [], loading: isLoading };
}

export function useSaveBloodPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (draft: PanelDraft) => {
      if (!user) throw new Error("Sign in required");
      const { id, ...fields } = draft;
      const payload = { ...fields, brand_user_id: user.id };
      if (id) {
        const { error } = await supabase.from(PANELS).update(payload as never).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from(PANELS)
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BLOOD_BRANDS_KEY }),
  });
}

export function useDeleteBloodPanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(PANELS).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BLOOD_BRANDS_KEY }),
  });
}

/** Admin-only verification switch. The RPC re-checks the admin role server-side. */
export function useSetBrandBloodVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brandUserId, verified }: { brandUserId: string; verified: boolean }) => {
      const { error } = await supabase.rpc("set_brand_blood_verification" as never, {
        _brand_user_id: brandUserId,
        _verified: verified,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BLOOD_BRANDS_KEY });
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}
