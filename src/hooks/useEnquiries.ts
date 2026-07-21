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

export function useCreateEnquiry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateEnquiryInput) => {
      if (!user?.id) throw new Error("Sign in required");
      const { data, error } = await supabase
        .from("pro_enquiries")
        .insert({
          consumer_id: user.id,
          pro_user_id: input.pro_user_id,
          note: input.note ?? null,
          service_interest: input.service_interest ?? null,
          preferred_timeframe: input.preferred_timeframe ?? null,
          contact_method: input.contact_method ?? null,
          contact_phone: input.contact_phone ?? null,
          location_preference: input.location_preference ?? null,
          budget_range: input.budget_range ?? null,
          share_passport_consent: true,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Enquiry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_enquiries"] }),
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
