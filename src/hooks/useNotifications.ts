import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { useChatThreads } from "@/hooks/useChat";
import { notificationInView } from "@/lib/notificationScope";

export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  url: string | null;
  title: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

/** Live in-app notifications for the current user (mentions, etc.). */
export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const view = useActiveRoleView();
  // View-scoped threads: message notifications follow the same separation.
  const { data: viewThreads } = useChatThreads();


  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });


  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifications:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  // Only notifications belonging to the view the user is currently inside.
  const scoped = useMemo(() => {
    const threadIds = new Set((viewThreads ?? []).map((t) => t.id));
    return (q.data ?? []).filter((n) => notificationInView(n, view, threadIds));
  }, [q.data, viewThreads, view]);

  const unreadCount = scoped.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user?.id) return;
    // Clears only what this view can actually see.
    const ids = scoped.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", ids)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  /** Mark a specific set of notifications read (mark-on-view of the list). */
  const markManyRead = async (ids: string[]) => {
    if (!user?.id || ids.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", ids)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  return { notifications: q.data ?? [], unreadCount, isLoading: q.isLoading, markAllRead, markRead, markManyRead };
}

