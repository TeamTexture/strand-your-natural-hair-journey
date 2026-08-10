import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { todayKey } from "@/lib/treatmentSchedule";

/**
 * Brand tagging, app-wide. One hook set, one control, one display component —
 * every surface (treatment plans, plan products, wash days, style entries,
 * glossary terms) uses these, so the disclosure rules can never drift apart
 * between surfaces.
 *
 * Reads go through brand_tags_for(), a security-definer function that mirrors
 * the brand_tags SELECT policies and attaches the brand's public identity.
 * Members cannot generally read brand_profiles, so a client-side join would
 * silently return nothing.
 */

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type TaggableType =
  | "treatment_plan"
  | "treatment_plan_product"
  | "wash_day"
  | "style_entry"
  | "glossary_term";

export const TAGGABLE_LABELS: Record<TaggableType, string> = {
  treatment_plan: "a member's treatment plan",
  treatment_plan_product: "a product on a member's treatment plan",
  wash_day: "a member's wash day",
  style_entry: "a member's style record",
  glossary_term: "an ingredient glossary entry",
};

export type BrandTagType = "editorial" | "promoted";

export interface BrandTag {
  id: string;
  /** Null when the member typed a brand that isn't on STRAND. */
  brand_id: string | null;
  brand_user_id: string | null;
  brand_name: string;
  logo_path: string | null;
  tag_type: BrandTagType;
  disclosure_label: string | null;
  promotion_starts_on: string | null;
  promotion_ends_on: string | null;
}

/** A promoted tag only counts as promoted inside its window. */
export function promotionIsLive(tag: BrandTag, today = todayKey()): boolean {
  if (tag.tag_type !== "promoted") return false;
  if (tag.promotion_starts_on && tag.promotion_starts_on > today) return false;
  if (tag.promotion_ends_on && tag.promotion_ends_on < today) return false;
  return true;
}

/**
 * Tags to render. A promoted tag outside its window is HIDDEN rather than
 * downgraded to editorial: the brand paid for a window, and showing the name
 * afterwards as an apparently organic mention is exactly the thing the
 * disclosure rules exist to prevent.
 */
export function visibleTags(tags: BrandTag[]): BrandTag[] {
  const shown = tags.filter((t) => t.tag_type === "editorial" || promotionIsLive(t));
  // Alphabetical, never paid-first. Ordering must not dress a paid placement
  // up as the organic recommendation at the top of the list.
  return [...shown].sort((a, b) => a.brand_name.localeCompare(b.brand_name));
}

export function useBrandTags(taggableType: TaggableType, taggableId?: string | null) {
  const q = useQuery({
    queryKey: ["brand-tags", taggableType, taggableId],
    enabled: !!taggableId,
    staleTime: 60_000,
    queryFn: async (): Promise<BrandTag[]> => {
      const { data, error } = await db.rpc("brand_tags_for", {
        _taggable_type: taggableType,
        _taggable_id: taggableId,
      });
      if (error) throw error;
      return (data ?? []) as BrandTag[];
    },
  });
  return { tags: q.data ?? [], loading: q.isLoading };
}

export interface BrandOption {
  id: string;
  brand_name: string;
}

export function useBrandTagOptions(enabled = true) {
  const q = useQuery({
    queryKey: ["brand-tag-options"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BrandOption[]> => {
      const { data, error } = await db.rpc("brand_tag_options");
      if (error) throw error;
      return (data ?? []) as BrandOption[];
    },
  });
  return { brands: q.data ?? [], loading: q.isLoading };
}

export function defaultDisclosure(brandName: string) {
  return `Paid partnership with ${brandName}`;
}

export function useSaveBrandTag(taggableType: TaggableType, taggableId?: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (v: {
      brand_id?: string | null;
      custom_brand_name?: string | null;
      tag_type: BrandTagType;
      disclosure_label?: string | null;
      promotion_starts_on?: string | null;
      promotion_ends_on?: string | null;
    }) => {
      // Mirror of the brand_tags_promoted_requires_disclosure CHECK, so the
      // user gets a sentence rather than a database error.
      if (v.tag_type === "promoted" && !v.disclosure_label?.trim()) {
        throw new Error("A promoted tag needs a disclosure label before it can be saved.");
      }
      if (!v.brand_id && !v.custom_brand_name?.trim()) {
        throw new Error("Pick a brand, or type the brand's name.");
      }
      const { error } = await db.from("brand_tags").insert({
        brand_id: v.brand_id || null,
        custom_brand_name: v.brand_id ? null : v.custom_brand_name!.trim(),
        taggable_type: taggableType,
        taggable_id: taggableId,
        tag_type: v.tag_type,
        disclosure_label: v.tag_type === "promoted" ? v.disclosure_label!.trim() : null,
        promotion_starts_on: v.tag_type === "promoted" ? v.promotion_starts_on || null : null,
        promotion_ends_on: v.tag_type === "promoted" ? v.promotion_ends_on || null : null,
        created_by_user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["brand-tags", taggableType, taggableId] });
    },
  });
}

export function useDeleteBrandTag(taggableType: TaggableType, taggableId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("brand_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["brand-tags", taggableType, taggableId] });
    },
  });
}

/** Read-only: every tag naming the signed-in brand. No record detail — by design. */
export interface MyBrandTagRow {
  id: string;
  taggable_type: TaggableType;
  tag_type: BrandTagType;
  disclosure_label: string | null;
  promotion_starts_on: string | null;
  promotion_ends_on: string | null;
  created_at: string;
}

export function useMyBrandTags() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-brand-tags", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<MyBrandTagRow[]> => {
      // Deliberately no join: the RLS lets a brand read its own brand_tags rows
      // and nothing about the tagged record. A join would return zero rows and
      // look like a bug.
      const { data, error } = await db
        .from("brand_tags")
        .select(
          "id, taggable_type, tag_type, disclosure_label, promotion_starts_on, promotion_ends_on, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MyBrandTagRow[];
    },
  });
  return { tags: q.data ?? [], loading: q.isLoading };
}
