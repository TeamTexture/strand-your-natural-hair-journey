import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BrandBloodPanel } from "@/lib/bloodTestBrands";

/**
 * Blood test routes come from two kinds of row in `brand_blood_panels`:
 *
 *  1. REGISTERED BRANDS — `brand_user_id` set. Only surfaces once an admin has
 *     verified the at-home capability and the paid listing is active. Both
 *     conditions are enforced in RLS as well as here.
 *  2. CURATED VENDORS — `brand_user_id` NULL, `vendor_name` set. Third-party
 *     kit providers with no STRAND login, maintained by admins only. Surfaces
 *     purely on `is_active`.
 *
 * Nothing is hardcoded in the client either way.
 */

const PANELS = "brand_blood_panels" as never;

export const BLOOD_BRANDS_KEY = ["blood_test_brands"] as const;

type PanelRow = Omit<BrandBloodPanel, "brand_name" | "logo_path">;

/** Member-facing: curated vendors plus verified, live brands. */
export function useBloodTestBrandPanels() {
  const { data, isLoading } = useQuery({
    queryKey: [...BLOOD_BRANDS_KEY, "member"],
    staleTime: 60_000,
    queryFn: async (): Promise<BrandBloodPanel[]> => {
      // RLS already restricts brand rows to verified + actively-subscribed brands.
      const { data: rows, error } = await supabase
        .from(PANELS)
        .select("*")
        .eq("is_active" as never, true as never)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const panels = (rows ?? []) as unknown as PanelRow[];
      if (panels.length === 0) return [];

      const curated: BrandBloodPanel[] = panels
        .filter((p) => !p.brand_user_id)
        .map((p) => ({
          ...p,
          brand_name: p.vendor_name?.trim() || "Vendor",
          logo_path: p.vendor_logo_path ?? null,
        }));

      const brandRows = panels.filter((p) => !!p.brand_user_id);
      let branded: BrandBloodPanel[] = [];
      if (brandRows.length > 0) {
        const ids = Array.from(new Set(brandRows.map((p) => p.brand_user_id as string)));
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
        branded = brandRows
          // A panel whose brand row is unreadable/unverified never surfaces.
          .filter(
            (p) =>
              byUser.get(p.brand_user_id as string)?.offers_at_home_blood_tests_verified === true,
          )
          .map((p) => ({
            ...p,
            brand_name: byUser.get(p.brand_user_id as string)?.brand_name ?? "Brand",
            logo_path: byUser.get(p.brand_user_id as string)?.logo_path ?? null,
          }));
      }

      return [...curated, ...branded];
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

/* ------------------------------------------------------------------ */
/* CURATED VENDORS — admin only                                        */
/* ------------------------------------------------------------------ */

export type VendorDraft = {
  id?: string;
  vendor_name: string;
  vendor_website: string | null;
  panel_name: string | null;
  markers_covered: string[];
  price_from: number | null;
  currency: string;
  purchase_url: string | null;
  affiliate_url: string | null;
  regions_served: string[];
  discount_code: string | null;
  discount_details: string | null;
  is_at_home_kit: boolean;
  is_active: boolean;
  sort_order: number;
};

export const emptyVendorDraft = (): VendorDraft => ({
  vendor_name: "",
  vendor_website: null,
  panel_name: null,
  markers_covered: [],
  price_from: null,
  currency: "GBP",
  purchase_url: null,
  affiliate_url: null,
  regions_served: [],
  discount_code: null,
  discount_details: null,
  is_at_home_kit: true,
  is_active: false,
  sort_order: 0,
});

/** Every curated vendor row, active or not. Admin screens only. */
export function useCuratedBloodVendors() {
  const { data, isLoading } = useQuery({
    queryKey: [...BLOOD_BRANDS_KEY, "curated"],
    staleTime: 0,
    queryFn: async (): Promise<VendorDraft[]> => {
      const { data: rows, error } = await supabase
        .from(PANELS)
        .select("*")
        .is("brand_user_id" as never, null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (rows ?? []) as unknown as VendorDraft[];
    },
  });
  return { vendors: data ?? [], loading: isLoading };
}

export function useSaveCuratedBloodVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: VendorDraft) => {
      const { id, ...fields } = draft;
      const payload = { ...fields, brand_user_id: null };
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
