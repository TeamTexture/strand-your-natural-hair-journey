import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type EnquiryStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface Enquiry {
  id: string;
  consumer_id: string;
  pro_user_id: string;
  note: string | null;
  share_passport_consent: boolean;
  status: EnquiryStatus;
  responded_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
  service_interest: string | null;
  preferred_timeframe: string | null;
  contact_method: string | null;
  contact_phone: string | null;
  location_preference: string | null;
  budget_range: string | null;
}

export interface CreateEnquiryInput {
  pro_user_id: string;
  note?: string | null;
  service_interest?: string | null;
  preferred_timeframe?: string | null;
  contact_method?: string | null;
  contact_phone?: string | null;
  location_preference?: string | null;
  budget_range?: string | null;
  share_passport_consent?: boolean;
}

export interface ClientAccess {
  id: string;
  pro_user_id: string;
  consumer_id: string;
  enquiry_id: string | null;
  granted_at: string;
  revoked_at: string | null;
}

/** Consumer: list of enquiries I sent. */
export function useMyEnquiries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_enquiries", user?.id],
    enabled: !!user?.id,
    // Enquiry state drives the directory's Enquire/Chat now action — it must
    // never be stale when the user returns to the app.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Enquiry[]> => {
      const { data, error } = await supabase
        .from("pro_enquiries")
        .select("*")
        .eq("consumer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Enquiry[];
    },
  });
}

/** Pro: enquiries addressed to me. */
export function useProInbox() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pro_inbox", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Enquiry[]> => {
      const { data, error } = await supabase
        .from("pro_enquiries")
        .select("*")
        .eq("pro_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Enquiry[];
    },
  });
}

/** Consumer: pros with active access to my passport. */
export function useMyClientAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_client_access", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ClientAccess[]> => {
      const { data, error } = await supabase
        .from("pro_client_access")
        .select("*")
        .eq("consumer_id", user!.id)
        .is("revoked_at", null)
        .order("granted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientAccess[];
    },
  });
}

/**
 * Consumer: every professional they have a relationship with (any enquiry
 * sent, or any access grant past or present) plus whether that professional
 * currently holds passport access. Powers the Data access screen, where the
 * member can turn access on or off at any time — including before the
 * professional has accepted the enquiry.
 */
export interface PassportShareRow {
  pro_user_id: string;
  granted: boolean;
  /** Access record id when a grant exists (active or revoked). */
  access_id: string | null;
  granted_at: string | null;
  revoked_at: string | null;
  enquiry_status: EnquiryStatus | null;
  enquiry_created_at: string | null;
  /** Member's stored sharing consent on the latest enquiry. */
  consent: boolean;
}


export function useMyPassportSharing() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_passport_sharing", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PassportShareRow[]> => {
      const uid = user!.id;
      const [accessRes, enquiryRes] = await Promise.all([
        supabase
          .from("pro_client_access")
          .select("*")
          .eq("consumer_id", uid)
          .order("granted_at", { ascending: false }),
        supabase
          .from("pro_enquiries")
          .select("id, pro_user_id, status, created_at")
          .eq("consumer_id", uid)
          .order("created_at", { ascending: false }),
      ]);
      if (accessRes.error) throw accessRes.error;
      if (enquiryRes.error) throw enquiryRes.error;

      const byPro = new Map<string, PassportShareRow>();
      const ensure = (proId: string): PassportShareRow => {
        const existing = byPro.get(proId);
        if (existing) return existing;
        const row: PassportShareRow = {
          pro_user_id: proId,
          granted: false,
          access_id: null,
          granted_at: null,
          revoked_at: null,
          enquiry_status: null,
          enquiry_created_at: null,
        };
        byPro.set(proId, row);
        return row;
      };

      for (const e of enquiryRes.data ?? []) {
        if (e.status === "withdrawn") continue;
        const row = ensure(e.pro_user_id);
        if (!row.enquiry_status) {
          row.enquiry_status = e.status as EnquiryStatus;
          row.enquiry_created_at = e.created_at;
        }
      }
      for (const a of (accessRes.data ?? []) as ClientAccess[]) {
        const row = ensure(a.pro_user_id);
        const active = a.revoked_at === null;
        if (active || !row.access_id) {
          row.access_id = a.id;
          row.granted_at = a.granted_at;
          row.revoked_at = a.revoked_at;
        }
        if (active) row.granted = true;
      }
      return Array.from(byPro.values()).sort((a, b) => {
        if (a.granted !== b.granted) return a.granted ? -1 : 1;
        return (b.granted_at ?? b.enquiry_created_at ?? "").localeCompare(
          a.granted_at ?? a.enquiry_created_at ?? "",
        );
      });
    },
  });
}

/** Consumer: turn a professional's passport access on or off at any time. */
export function useSetPassportAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proUserId, grant }: { proUserId: string; grant: boolean }) => {
      const { error } = await supabase.rpc("set_passport_access", {
        _pro_user_id: proUserId,
        _grant: grant,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_passport_sharing"] });
      qc.invalidateQueries({ queryKey: ["my_client_access"] });
      qc.invalidateQueries({ queryKey: ["my_enquiries"] });
      qc.invalidateQueries({ queryKey: ["pro-clients"] });
    },
  });
}

export function useCreateEnquiry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateEnquiryInput) => {
      if (!user?.id) throw new Error("Sign in required");
      const { data, error } = await supabase.rpc("send_enquiry_with_access", {
        _pro_user_id: input.pro_user_id,
        _note: input.note ?? null,
        _service_interest: input.service_interest ?? null,
        _preferred_timeframe: input.preferred_timeframe ?? null,
        _contact_method: input.contact_method ?? null,
        _contact_phone: input.contact_phone ?? null,
        _location_preference: input.location_preference ?? null,
        _budget_range: input.budget_range ?? null,
        _share_passport_consent: input.share_passport_consent ?? false,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_enquiries"] });
      qc.invalidateQueries({ queryKey: ["my_client_access"] });
    },
  });
}

export function useWithdrawEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pro_enquiries")
        .update({ status: "withdrawn" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_enquiries"] }),
  });
}

export function useAcceptEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("accept_enquiry", { _enquiry_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro_inbox"] });
    },
  });
}

export function useDeclineEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from("pro_enquiries")
        .update({
          status: "declined",
          decline_reason: input.reason ?? null,
          responded_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pro_inbox"] }),
  });
}

export function useRevokeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pro_client_access")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_client_access"] }),
  });
}
