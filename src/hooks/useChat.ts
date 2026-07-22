import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  threadMatchesView,
  useActiveRoleView,
  type ActiveRoleView,
} from "@/hooks/useActiveRoleView";

export type ChatThreadType = "client_pro" | "admin_support";

export interface ChatThread {
  id: string;
  enquiry_id: string | null;
  pro_user_id: string | null;
  consumer_id: string | null;
  admin_user_id: string | null;
  subject_user_id: string | null;
  subject_role: string | null;
  thread_type: ChatThreadType;
  created_at: string;
  last_message_at: string | null;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  kind: "text" | "system";
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

/** Return the id of the "other" participant relative to me. */
export function otherParticipantId(t: ChatThread, myId: string): string | null {
  if (t.thread_type === "admin_support") {
    return myId === t.admin_user_id ? t.subject_user_id : t.admin_user_id;
  }
  return myId === t.pro_user_id ? t.consumer_id : t.pro_user_id;
}

const threadOrFilter = (uid: string) =>
  `pro_user_id.eq.${uid},consumer_id.eq.${uid},admin_user_id.eq.${uid},subject_user_id.eq.${uid}`;

/**
 * All threads I'm a participant in, scoped to the current role view.
 * Pass `scope: "all"` to bypass scoping (e.g. cross-view unread hints).
 */
export function useChatThreads(scope?: ActiveRoleView | "all") {
  const { user } = useAuth();
  const activeView = useActiveRoleView();
  const view = scope ?? activeView;
  const query = useQuery({
    queryKey: ["chat_threads", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ChatThread[]> => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("*")
        .or(threadOrFilter(user!.id))
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ChatThread[];
    },
  });
  const filtered = useMemo(() => {
    if (!user?.id || !query.data) return query.data;
    if (view === "all") return query.data;
    return query.data.filter((t) => threadMatchesView(t, user.id, view));
  }, [query.data, user?.id, view]);
  return { ...query, data: filtered } as typeof query;
}


/** Single thread + its messages, with realtime updates. */
export function useChatThread(threadId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const thread = useQuery({
    queryKey: ["chat_thread", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<ChatThread | null> => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("*")
        .eq("id", threadId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatThread | null;
    },
  });

  const messages = useQuery({
    queryKey: ["chat_messages", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  useEffect(() => {
    if (!threadId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
      qc.invalidateQueries({ queryKey: ["chat_unread", user?.id] });
      qc.invalidateQueries({ queryKey: ["chat_thread_meta"] });
      qc.invalidateQueries({ queryKey: ["chat_widget_previews"] });
    };
    const channel = supabase
      .channel(`chat_thread_${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        invalidate,
      )
      // Also listen for UPDATEs so the sender sees read_at flip → green ticks
      // in real time when the recipient opens the thread.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc, user?.id]);

  return { thread, messages };
}

export function useSendChatMessage(threadId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!threadId || !user?.id) throw new Error("Not ready");
      const text = body.trim();
      if (!text) throw new Error("Empty message");
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        kind: "text",
        body: text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
    },
  });
}

export function useMarkThreadRead(threadId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!threadId || !user?.id) return;
      await supabase
        .from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("thread_id", threadId)
        .neq("sender_id", user.id)
        .is("read_at", null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat_unread", user?.id] });
    },
  });
}

/**
 * Unread count scoped to the current role view (or `scope: "all"` for a
 * cross-view total, and a specific view for view-switcher dot hints).
 */
export function useUnreadChatCount(scope?: ActiveRoleView | "all") {
  const { user } = useAuth();
  const activeView = useActiveRoleView();
  const view = scope ?? activeView;
  return useQuery({
    queryKey: ["chat_unread", user?.id, view],
    enabled: !!user?.id,
    queryFn: async (): Promise<number> => {
      const { data: rows } = await supabase
        .from("chat_threads")
        .select("id, thread_type, consumer_id, pro_user_id, admin_user_id, subject_user_id, subject_role")
        .or(threadOrFilter(user!.id));
      const scoped = (rows ?? []).filter((t) =>
        view === "all" ? true : threadMatchesView(t as never, user!.id, view),
      );
      const ids = scoped.map((t) => t.id);
      if (ids.length === 0) return 0;
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", ids)
        .neq("sender_id", user!.id)
        .is("read_at", null);
      return count ?? 0;
    },
  });
}


export function useBookAppointmentInThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      thread_id: string;
      appointment_date: string;
      appointment_time?: string;
      location?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("chat_book_appointment", {
        _thread_id: input.thread_id,
        _appointment_date: input.appointment_date,
        _appointment_time: input.appointment_time ?? "",
        _location: input.location ?? "",
        _notes: input.notes ?? "",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["chat_messages", vars.thread_id] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

/** Admin-only: open or reuse a support thread with a target user in a specific role context. */
export function useStartAdminSupportThread() {
  return useMutation({
    mutationFn: async (
      arg: string | { subjectUserId: string; subjectRole?: "consumer" | "pro" | "brand" },
    ) => {
      const subjectUserId = typeof arg === "string" ? arg : arg.subjectUserId;
      const subjectRole = typeof arg === "string" ? "consumer" : arg.subjectRole ?? "consumer";
      const { data, error } = await supabase.rpc("admin_start_support_thread", {
        _subject_user: subjectUserId,
        _subject_role: subjectRole,
      });
      if (error) throw error;
      return data as string;
    },
  });
}

