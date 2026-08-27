// Member ↔ STRAND Team direct messaging.
// Reuses the existing chat_threads / chat_messages system: one
// `admin_support` thread per member, grouped by subject_user_id.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import type { ChatThread } from "@/hooks/useChat";

/** The member's own STRAND Team thread, if one exists yet. */
export function useMySupportThread() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["support_thread", user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ChatThread | null> => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("*")
        .eq("thread_type", "admin_support")
        .eq("subject_user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatThread | null;
    },
  });

  // Same realtime pattern the rest of the chat surfaces use, so an admin reply
  // lands without the member reopening the drawer.
  const threadId = q.data?.id;
  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`support_thread_${threadId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
          qc.invalidateQueries({ queryKey: ["support_unread", threadId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId, qc]);

  return q;
}

/** Unread admin replies waiting for the member. */
export function useMySupportUnread(threadId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["support_unread", threadId],
    enabled: !!threadId && !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", threadId!)
        .is("read_at", null)
        .not("sender_id", "is", null)
        .neq("sender_id", user!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Open (or reuse) the member's own STRAND Team thread. */
export function useOpenMySupportThread() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("member_start_support_thread");
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support_thread", user?.id] });
      qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
    },
  });
}

export interface AdminSupportRow {
  thread: ChatThread;
  name: string;
  email: string | null;
  preview: string;
  lastAt: string;
  unread: number;
}

/**
 * Every member support conversation, for the admin inbox.
 * Admin read access is gated by has_role(auth.uid(), 'admin') in RLS — the
 * same admin check used everywhere else in this project.
 */
export function useAdminSupportThreads() {
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin_support_threads"],
    enabled: !!user?.id && isAdmin,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AdminSupportRow[]> => {
      const { data: threads, error } = await supabase
        .from("chat_threads")
        .select("*")
        .eq("thread_type", "admin_support")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const rows = (threads ?? []) as ChatThread[];
      if (rows.length === 0) return [];

      const ids = rows.map((t) => t.id);
      const subjectIds = Array.from(
        new Set(rows.map((t) => t.subject_user_id).filter((v): v is string => !!v)),
      );

      const [msgRes, profRes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("thread_id, body, kind, sender_id, read_at, created_at")
          .in("thread_id", ids)
          .order("created_at", { ascending: false })
          .limit(Math.min(600, ids.length * 20)),
        subjectIds.length
          ? supabase
              .from("profiles")
              .select("user_id, display_name, email")
              .in("user_id", subjectIds)
          : Promise.resolve({ data: [] as { user_id: string; display_name: string | null; email: string | null }[] }),
      ]);

      const preview = new Map<string, { body: string; at: string }>();
      const unread = new Map<string, number>();
      for (const m of msgRes.data ?? []) {
        if (!preview.has(m.thread_id) && m.kind !== "system") {
          preview.set(m.thread_id, {
            body: m.kind === "voice" ? "🎤 Voice note" : m.kind === "image" ? "📷 Photo" : m.body ?? "",
            at: m.created_at,
          });
        }
        // Unread for the admin side = anything the member sent that no admin
        // has opened yet.
        if (!m.read_at && m.sender_id && m.sender_id !== user!.id) {
          unread.set(m.thread_id, (unread.get(m.thread_id) ?? 0) + 1);
        }
      }

      const profiles = new Map(
        ((profRes.data ?? []) as { user_id: string; display_name: string | null; email: string | null }[]).map(
          (p) => [p.user_id, p],
        ),
      );

      return rows
        .map((t) => {
          const p = t.subject_user_id ? profiles.get(t.subject_user_id) : undefined;
          const pv = preview.get(t.id);
          return {
            thread: t,
            name: p?.display_name?.trim() || "Member",
            email: p?.email ?? null,
            preview: pv?.body ?? "No messages yet",
            lastAt: pv?.at ?? t.last_message_at ?? t.created_at,
            unread: unread.get(t.id) ?? 0,
          };
        })
        .sort((a, b) => {
          if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) {
            return (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0);
          }
          return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
        });
    },
  });

  useEffect(() => {
    if (!user?.id || !isAdmin) return;
    const ch = supabase
      .channel(`admin_support_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["admin_support_threads"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, isAdmin, qc]);

  return q;
}

/** Total unread member messages across every support thread (admin nav badge). */
export function useAdminSupportUnreadCount() {
  const { data } = useAdminSupportThreads();
  return (data ?? []).reduce((n, r) => n + r.unread, 0);
}
