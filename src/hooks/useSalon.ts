import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import {
  sendStylistListedNotification_STUB,
  type StylistListedPayload,
} from "@/lib/notifyStylistListed";

export type Discipline = Database["public"]["Enums"]["pro_discipline"];
export type Salon = Database["public"]["Tables"]["salons"]["Row"];
export type SalonMember = Database["public"]["Tables"]["salon_members"]["Row"];
export type StylistProfile = Database["public"]["Tables"]["pro_profiles"]["Row"];
export type SalonService = { name: string; price?: string; duration?: string };

/**
 * Where an enquiry for a stylist should be delivered.
 * A stylist may decline to give an email — that must never block the salon
 * going live, so we fall back to the salon's shared business email.
 */
export const stylistEnquiryEmail = (
  stylist: Pick<StylistProfile, "contact_email">,
  salon: Pick<Salon, "business_email"> | null | undefined,
): string | null =>
  stylist.contact_email?.trim() || salon?.business_email?.trim() || null;

/** The signed-in user's salon membership, if any. NULL = solo professional. */
export const useMySalon = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-salon", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("salon_members")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      if (!members?.length) return null;
      // A login scoped to a single stylist (pro_profile_id set) is the future
      // paid per-stylist login. Owner rows (pro_profile_id null) win.
      const owner = members.find((m) => m.pro_profile_id === null) ?? members[0];
      const { data: salon, error: sErr } = await supabase
        .from("salons")
        .select("*")
        .eq("id", owner.salon_id)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!salon) return null;
      return {
        salon,
        member: owner,
        /** Owner scope = can act for every stylist in the salon. */
        isOwner: owner.pro_profile_id === null,
        scopedProfileId: owner.pro_profile_id,
      };
    },
    staleTime: 60_000,
  });
};

/** Stylist profiles belonging to the signed-in user's salon. */
export const useSalonStylists = (salonId: string | undefined) => {
  const { data: mine } = useMySalon();
  return useQuery({
    queryKey: ["salon-stylists", salonId, mine?.scopedProfileId ?? "all"],
    enabled: !!salonId,
    queryFn: async () => {
      let q = supabase
        .from("pro_profiles")
        .select("*")
        .eq("salon_id", salonId!)
        .order("display_name");
      if (mine?.scopedProfileId) q = q.eq("id", mine.scopedProfileId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StylistProfile[];
    },
  });
};

export type StylistDraft = {
  display_name: string;
  discipline: Discipline;
  specialisms: string[];
  services: SalonService[];
  contact_email: string;
  bio: string;
  discount_code: string;
  discount_description: string;
  discount_active: boolean;
};

export const emptyStylistDraft = (): StylistDraft => ({
  display_name: "",
  discipline: "Stylist",
  specialisms: [],
  services: [],
  contact_email: "",
  bio: "",
  discount_code: "",
  discount_description: "",
  discount_active: false,
});

const draftToRow = (d: StylistDraft) => {
  const code = d.discount_code.trim().toUpperCase();
  return {
    display_name: d.display_name.trim(),
    discipline: d.discipline,
    specialisms: d.specialisms,
    services: d.services as never,
    contact_email: d.contact_email.trim() || null,
    bio: d.bio.trim() || null,
    discount_code: code || null,
    discount_description: d.discount_description.trim() || null,
    discount_active: d.discount_active && !!code,
  };
};

export const useAddSalonStylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      salon,
      draft,
    }: {
      salon: Salon;
      draft: StylistDraft;
    }) => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .insert({
          ...draftToRow(draft),
          user_id: null,
          salon_id: salon.id,
          // Address and hours live at salon level so two stylists in one
          // building can never drift apart.
          is_published: true,
          profile_review_status: "approved",
        } as never)
        .select("id, contact_email, display_name")
        .single();
      if (error) throw error;

      const payload: StylistListedPayload = {
        proProfileId: (data as { id: string }).id,
        stylistName: draft.display_name.trim(),
        recipientEmail: stylistEnquiryEmail(
          { contact_email: draft.contact_email.trim() || null },
          salon,
        ),
        salonName: salon.name,
        listingUrl: `${window.location.origin}/directory`,
      };
      await sendStylistListedNotification_STUB(payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salon-stylists"] });
    },
  });
};

export const useUpdateSalonStylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: StylistDraft }) => {
      const { error } = await supabase
        .from("pro_profiles")
        .update(draftToRow(draft) as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salon-stylists"] });
    },
  });
};

/**
 * Removing a stylist unpublishes rather than deletes, so enquiry history,
 * appointments and reviews survive.
 */
export const useSetStylistPublished = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase
        .from("pro_profiles")
        .update({
          is_published: published,
          suspended_at: published ? null : new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salon-stylists"] });
    },
  });
};
