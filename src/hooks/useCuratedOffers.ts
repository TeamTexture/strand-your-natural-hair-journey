// ─────────────────────────────────────────────────────────────────────────────
// Curated offers — STRAND-created partner deals.
//
// Deliberately SEPARATE from the paid brand ad system (`brand_offers`):
// no brand account, no bookable slot, no Stripe checkout, no ad_events. Nothing
// in this file reads or writes anything the live brand campaign flow touches,
// so brand revenue, metrics and revision charging cannot be affected by it.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CuratedOffer = Database["public"]["Tables"]["curated_offers"]["Row"];
export type CuratedOfferInput = Database["public"]["Tables"]["curated_offers"]["Insert"];

/** Today in Europe/London — matches the window the RLS read policy applies. */
export function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Member-facing: the offers live today, in display order.
 *  RLS already restricts rows to active / not hidden / inside the window, so
 *  the filters here only keep the client honest if a policy ever loosens. */
export function useLiveCuratedOffers() {
  return useQuery({
    queryKey: ["curated-offers", "live", londonToday()],
    staleTime: 60_000,
    queryFn: async () => {
      const today = londonToday();
      const { data, error } = await supabase
        .from("curated_offers")
        .select("*")
        .eq("is_active", true)
        .is("hidden_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter(
        (o) =>
          (!o.starts_on || o.starts_on <= today) &&
          (!o.ends_on || o.ends_on >= today),
      );
    },
  });
}

/** Admin-facing: every offer, live or not. */
export function useAllCuratedOffers() {
  return useQuery({
    queryKey: ["curated-offers", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curated_offers")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCuratedOfferMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["curated-offers"] });

  const create = useMutation({
    mutationFn: async (input: CuratedOfferInput) => {
      const { data, error } = await supabase
        .from("curated_offers")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CuratedOffer> }) => {
      const { error } = await supabase.from("curated_offers").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("curated_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** Signed URL for a curated offer image (private bucket, `curated/` prefix). */
export function useCuratedOfferImage(path: string | null | undefined) {
  return useQuery({
    queryKey: ["curated-offer-image", path],
    enabled: !!path,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage
        .from("brand-assets")
        .createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

/** Upload an image for a curated offer. Admin-only by storage policy. */
export async function uploadCuratedOfferImage(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `curated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("brand-assets").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
