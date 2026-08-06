// Brand-side permanent catalogue ("brand shelf").
//
// A brand's shelf lives in `brand_products` keyed by `brand_user_id` and is
// independent of any campaign — offers reference shelf items through
// `brand_offer_products`. Every content edit drops the item back to
// `approval_status = 'pending'` and unpublishes it (enforced by a database
// trigger, not by this hook).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { BrandShelfProduct } from "@/lib/addBrandProductToShelf";

export interface BrandShelfItem {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  tool_kind: string | null;
  image_urls: string[] | null;
  ingredients: string[] | null;
  ingredients_source: string | null;
  key_features: string[] | null;
  materials: string[] | null;
  external_url: string | null;
  source_url: string | null;
  source_type: string | null;
  position: number;
  is_published: boolean;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  updated_at: string;
}

export interface BrandMemberCount {
  brand_product_id: string;
  name: string;
  shelf_count: number | null;
  wishlist_count: number | null;
  favourite_count: number | null;
  suppressed: boolean;
  min_threshold: number;
}

export const APPROVAL_LABEL: Record<string, string> = {
  pending: "In review",
  approved: "Approved",
  rejected: "Changes needed",
};

export function useBrandShelf() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-shelf", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BrandShelfItem[]> => {
      const { data, error } = await supabase
        .from("brand_products")
        .select("id, name, description, kind, tool_kind, image_urls, ingredients, ingredients_source, key_features, materials, external_url, source_url, source_type, position, is_published, approval_status, rejection_reason, updated_at")
        .eq("brand_user_id", user!.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BrandShelfItem[];
    },
  });
}

/**
 * Aggregate member interest. The 50-member threshold is enforced inside the
 * database function — any metric below it comes back NULL and `suppressed`
 * true. No query on this path returns user ids.
 */
export function useBrandMemberCounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-member-counts", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, BrandMemberCount>> => {
      const { data, error } = await supabase.rpc("brand_product_member_counts", {
        _brand_user_id: user!.id,
      });
      if (error) throw error;
      const out: Record<string, BrandMemberCount> = {};
      for (const row of (data ?? []) as BrandMemberCount[]) {
        out[row.brand_product_id] = row;
      }
      return out;
    },
  });
}

export function useSaveShelfItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<BrandShelfItem> & { id?: string }) => {
      if (!user) throw new Error("Please sign in");
      const body: Record<string, unknown> = {
        brand_user_id: user.id,
        name: item.name,
        description: item.description ?? null,
        kind: item.kind ?? "product",
        tool_kind: item.tool_kind ?? null,
        ingredients: item.ingredients ?? [],
        ingredients_source: item.ingredients_source ?? "manual",
        key_features: item.key_features ?? [],
        materials: item.materials ?? [],
        image_urls: item.image_urls ?? [],
        external_url: item.external_url ?? null,
        source_url: item.source_url ?? null,
        source_type: item.source_type ?? "manual",
        position: item.position ?? 0,
      };
      if (item.id) {
        const { error } = await supabase
          .from("brand_products")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(body as any)
          .eq("id", item.id);
        if (error) throw error;
        return item.id;
      }
      const { data, error } = await supabase
        .from("brand_products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(body as any)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["brand-shelf"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save that product"),
  });
}

export function useSetShelfPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase
        .from("brand_products")
        .update({ is_published: published })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["brand-shelf"] }),
    onError: () => toast.error("Could not update that product"),
  });
}

export function useDeleteShelfItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["brand-shelf"] }),
    onError: () => toast.error("Could not remove that product"),
  });
}

export function useReorderShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; position: number }[]) => {
      for (const row of ordered) {
        const { error } = await supabase
          .from("brand_products")
          .update({ position: row.position })
          .eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["brand-shelf"] }),
    onError: () => toast.error("Could not reorder the shelf"),
  });
}

/** Public, approved + published shelf for a brand — consumer side. */
export function usePublicBrandShelf(brandUserId: string | undefined) {
  return useQuery({
    queryKey: ["brand-shelf-public", brandUserId],
    enabled: !!brandUserId,
    queryFn: async (): Promise<BrandShelfProduct[]> => {
      const { data, error } = await supabase.rpc("brand_shelf_products", {
        _brand_user_id: brandUserId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as BrandShelfProduct[];
    },
  });
}
