import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Blood test vendor registry — ADMIN MANAGED, NEVER HARDCODED.
 *
 * There is no vendor list in the codebase and no seeded rows: every vendor is
 * created in /admin/blood-vendors once a commercial agreement exists. Members
 * only ever read rows with `is_active = true` (enforced by RLS as well as here).
 */

export interface BloodTestVendor {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  short_description: string | null;
  panel_name: string | null;
  markers_covered: string[];
  price_from: number | null;
  currency: string;
  url: string | null;
  affiliate_url: string | null;
  regions_served: string[];
  at_home: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const VENDORS_KEY = ["blood_test_vendors"] as const;

const TABLE = "blood_test_vendors" as never;

async function loadVendors(activeOnly: boolean): Promise<BloodTestVendor[]> {
  let q = supabase.from(TABLE).select("*");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BloodTestVendor[];
}

/** Member-facing: active vendors only. */
export function useBloodTestVendors() {
  const { data, isLoading, error } = useQuery({
    queryKey: [...VENDORS_KEY, "active"],
    queryFn: () => loadVendors(true),
    staleTime: 60_000,
  });
  return { vendors: data ?? [], loading: isLoading, error };
}

/** Admin-facing: every vendor, active or not. */
export function useAllBloodTestVendors() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: [...VENDORS_KEY, "all"],
    queryFn: () => loadVendors(false),
    staleTime: 0,
  });
  return { vendors: data ?? [], loading: isLoading, refetch };
}

export type VendorDraft = Omit<BloodTestVendor, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export function useSaveBloodTestVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: VendorDraft) => {
      const { id, ...fields } = draft;
      if (id) {
        const { error } = await supabase
          .from(TABLE)
          .update(fields as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from(TABLE)
        .insert(fields as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDORS_KEY }),
  });
}

export function useDeleteBloodTestVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDORS_KEY }),
  });
}
