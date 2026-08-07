// Admin review queue for permanent brand shelf products (`brand_products`
// keyed by `brand_user_id`). Brands can never move their own item through
// review — the `brand_products_guard_approval` trigger forces every new or
// edited item back to `pending`, so an admin decision here is the only way a
// shelf item becomes visible to members.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ShelfApproval = "pending" | "approved" | "rejected";

export interface AdminShelfItem {
  id: string;
  brand_user_id: string;
  brand_name: string;
  name: string;
  description: string | null;
  kind: string | null;
  tool_kind: string | null;
  image_urls: string[] | null;
  ingredients: string[] | null;
  ingredients_source: string | null;
  key_features: string[] | null;
  materials: string[] | null;
  external_url: string | null;
  source_url: string | null;
  source_type: string | null;
  approval_status: ShelfApproval;
  rejection_reason: string | null;
  is_published: boolean;
  updated_at: string;
}

export const useAdminShelfItems = () =>
  useQuery({
    queryKey: ["admin", "shelf-review"],
    queryFn: async (): Promise<AdminShelfItem[]> => {
      const { data, error } = await supabase
        .from("brand_products")
        .select(
          "id, brand_user_id, name, description, kind, tool_kind, image_urls, ingredients, ingredients_source, key_features, materials, external_url, source_url, source_type, approval_status, rejection_reason, is_published, updated_at",
        )
        .not("brand_user_id", "is", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const rows = data ?? [];
      const brandIds = Array.from(new Set(rows.map((r) => r.brand_user_id as string)));
      const names = new Map<string, string>();
      if (brandIds.length > 0) {
        const { data: brands } = await supabase
          .from("brand_profiles")
          .select("user_id, brand_name")
          .in("user_id", brandIds);
        (brands ?? []).forEach((b) => names.set(b.user_id as string, b.brand_name as string));
      }

      return rows.map((r) => ({
        ...(r as unknown as AdminShelfItem),
        brand_name: names.get(r.brand_user_id as string) ?? "Unknown brand",
      }));
    },
  });

/** Count of shelf items awaiting an admin decision — used for the hub badge. */
export const usePendingShelfCount = () =>
  useQuery({
    queryKey: ["admin", "shelf-review", "pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("brand_products")
        .select("id", { count: "exact", head: true })
        .not("brand_user_id", "is", null)
        .eq("approval_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

export const useDecideShelfItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      reason,
    }: {
      id: string;
      decision: Exclude<ShelfApproval, "pending">;
      reason?: string;
    }) => {
      const { error } = await supabase
        .from("brand_products")
        .update(
          decision === "approved"
            ? { approval_status: "approved", rejection_reason: null }
            : { approval_status: "rejected", rejection_reason: reason ?? null, is_published: false },
        )
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "shelf-review"] });
      qc.invalidateQueries({ queryKey: ["brand-shelf"] });
    },
  });
};
