import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Salon, SalonMember } from "@/hooks/useSalon";

export type SalonRow = Salon & {
  stylistCount: number;
  publishedStylistCount: number;
  ownerCount: number;
};

/** Every salon, with roster and login counts, for the admin console. */
export const useAdminSalons = () =>
  useQuery({
    queryKey: ["admin-salons"],
    queryFn: async (): Promise<SalonRow[]> => {
      const [salons, stylists, members] = await Promise.all([
        supabase.from("salons").select("*").order("name"),
        supabase.from("pro_profiles").select("id, salon_id, is_published").not("salon_id", "is", null),
        supabase.from("salon_members").select("id, salon_id, role"),
      ]);
      if (salons.error) throw salons.error;
      if (stylists.error) throw stylists.error;
      if (members.error) throw members.error;

      return (salons.data ?? []).map((s) => {
        const roster = (stylists.data ?? []).filter((p) => p.salon_id === s.id);
        return {
          ...(s as Salon),
          stylistCount: roster.length,
          publishedStylistCount: roster.filter((p) => p.is_published).length,
          ownerCount: (members.data ?? []).filter(
            (m) => m.salon_id === s.id && m.role === "owner",
          ).length,
        };
      });
    },
    staleTime: 30_000,
  });

export type SalonDraft = {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  business_phone: string;
  business_email: string;
};

export const emptySalonDraft = (): SalonDraft => ({
  name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postcode: "",
  business_phone: "",
  business_email: "",
});

const draftToRow = (d: SalonDraft) => ({
  name: d.name.trim(),
  address_line1: d.address_line1.trim() || null,
  address_line2: d.address_line2.trim() || null,
  city: d.city.trim() || null,
  postcode: d.postcode.trim().toUpperCase() || null,
  business_phone: d.business_phone.trim() || null,
  business_email: d.business_email.trim() || null,
});

export const useCreateSalon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SalonDraft) => {
      const { data, error } = await supabase
        .from("salons")
        .insert({ ...draftToRow(draft), is_published: false })
        .select("*")
        .single();
      if (error) throw error;
      return data as Salon;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-salons"] }),
  });
};

export const useUpdateSalon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<SalonDraft> & { is_published?: boolean };
    }) => {
      const { is_published, ...rest } = patch;
      const row: Record<string, unknown> = {};
      if (Object.keys(rest).length > 0) {
        Object.assign(row, draftToRow({ ...emptySalonDraft(), ...(rest as SalonDraft) }));
        // Only send the keys the caller actually supplied — a partial edit must
        // never blank an address the caller didn't touch.
        for (const k of Object.keys(row)) {
          if (!(k in rest)) delete row[k];
        }
      }
      if (is_published !== undefined) row.is_published = is_published;
      const { error } = await supabase
        .from("salons")
        .update(row as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-salons"] });
      qc.invalidateQueries({ queryKey: ["salon-stylists"] });
    },
  });
};

export type MovablePro = {
  id: string;
  display_name: string | null;
  user_id: string | null;
  city: string | null;
  is_published: boolean;
};

/** Approved professional listings that don't yet belong to a salon. */
export const useUnassignedPros = () =>
  useQuery({
    queryKey: ["admin-unassigned-pros"],
    queryFn: async (): Promise<MovablePro[]> => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .select("id, display_name, user_id, city, is_published")
        .is("salon_id", null)
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as MovablePro[];
    },
    staleTime: 30_000,
  });

/**
 * Move an existing professional listing into a salon.
 *
 * If that listing has its own login, the same login also becomes a salon owner,
 * so an independent stylist joining a salon keeps managing her own listing and
 * gains the roster. Without this the pro would be locked out of her own card.
 */
export const useMoveProToSalon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      salonId,
      userId,
      makeOwner,
    }: {
      profileId: string;
      salonId: string | null;
      userId: string | null;
      makeOwner: boolean;
    }) => {
      const { error } = await supabase
        .from("pro_profiles")
        .update({ salon_id: salonId })
        .eq("id", profileId);
      if (error) throw error;

      if (salonId && userId && makeOwner) {
        const { error: mErr } = await supabase
          .from("salon_members")
          .upsert(
            { salon_id: salonId, user_id: userId, role: "owner", pro_profile_id: null },
            { onConflict: "salon_id,user_id,pro_profile_id" },
          );
        if (mErr) throw mErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-salons"] });
      qc.invalidateQueries({ queryKey: ["admin-unassigned-pros"] });
      qc.invalidateQueries({ queryKey: ["salon-stylists"] });
      qc.invalidateQueries({ queryKey: ["salon-owners"] });
    },
  });
};

export type SalonOwner = SalonMember & { name: string };

/** Logins that can manage a salon's roster. */
export const useSalonOwners = (salonId: string | undefined) =>
  useQuery({
    queryKey: ["salon-owners", salonId],
    enabled: !!salonId,
    queryFn: async (): Promise<SalonOwner[]> => {
      const { data, error } = await supabase
        .from("salon_members")
        .select("*")
        .eq("salon_id", salonId!);
      if (error) throw error;
      const rows = (data ?? []) as SalonMember[];
      if (rows.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", rows.map((r) => r.user_id));
      const names = new Map(
        (profiles ?? []).map((p) => [p.user_id, p.display_name ?? ""]),
      );
      return rows.map((r) => ({
        ...r,
        name: names.get(r.user_id)?.trim() || "Salon login",
      }));
    },
  });

export const useRemoveSalonOwner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("salon_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salon-owners"] });
      qc.invalidateQueries({ queryKey: ["admin-salons"] });
    },
  });
};

export const useAddSalonOwner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ salonId, userId }: { salonId: string; userId: string }) => {
      const { error } = await supabase.from("salon_members").upsert(
        { salon_id: salonId, user_id: userId, role: "owner", pro_profile_id: null },
        { onConflict: "salon_id,user_id,pro_profile_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salon-owners"] });
      qc.invalidateQueries({ queryKey: ["admin-salons"] });
    },
  });
};
