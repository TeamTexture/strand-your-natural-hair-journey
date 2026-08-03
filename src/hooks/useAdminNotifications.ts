import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

const KEY = ["admin", "notifications"];

/** Live admin approval-queue notifications. Admins only. */
export function useAdminNotifications() {
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: KEY,
    enabled: !!user?.id && isAdmin,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AdminNotification[];
    },
  });

  useEffect(() => {
    if (!user?.id || !isAdmin) return;
    const ch = supabase
      .channel(`admin_notifications:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notifications" },
        () => qc.invalidateQueries({ queryKey: KEY })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, isAdmin, qc]);

  const notifications = q.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    await supabase.rpc("admin_notifications_mark_read", { _ids: [id] });
    qc.invalidateQueries({ queryKey: KEY });
  };

  const markAllRead = async () => {
    await supabase.rpc("admin_notifications_mark_read", { _ids: null });
    qc.invalidateQueries({ queryKey: KEY });
  };

  /** Mark a specific set read — mark-on-view of the bell list. */
  const markManyRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.rpc("admin_notifications_mark_read", { _ids: ids });
    qc.invalidateQueries({ queryKey: KEY });
  };

  return { notifications, unreadCount, isAdmin, markRead, markAllRead, markManyRead };
}


/**
 * Clears any admin notification tied to a record the admin has just handled,
 * so finished work never leaves a ghost badge.
 */
export function useMarkAdminEntityRead() {
  const qc = useQueryClient();
  return async (entityType: string, entityId: string) => {
    try {
      await supabase.rpc("admin_notifications_mark_entity_read", {
        _entity_type: entityType,
        _entity_id: entityId,
      });
      qc.invalidateQueries({ queryKey: KEY });
    } catch {
      /* notification clean-up must never block the admin action */
    }
  };
}
