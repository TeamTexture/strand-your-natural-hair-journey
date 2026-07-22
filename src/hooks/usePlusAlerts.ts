// STRAND+ activity alerts. Notifies members of new threads, events, and
// direct messages posted by other STRAND+ members since their last visit
// to the relevant surface. Powered by Realtime so the alerts card updates
// live while the app is open, then falls back to a fetch on mount.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlusAccess } from "@/hooks/usePlusAccess";

export type PlusAlertKind = "thread" | "event" | "message" | "library";

export interface PlusAlert {
  id: string;
  kind: PlusAlertKind;
  title: string;
  body: string;
  to: string;
  createdAt: string;
}

const SEEN_KEY = "strand_plus_seen_v1";
type SeenMap = { threads?: string; events?: string; messages?: string; library?: string };

const readSeen = (): SeenMap => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
};
const writeSeen = (patch: SeenMap) => {
  const next = { ...readSeen(), ...patch };
  localStorage.setItem(SEEN_KEY, JSON.stringify(next));
};

export const markPlusSurfaceSeen = (surface: keyof SeenMap) => {
  writeSeen({ [surface]: new Date().toISOString() });
};

export function usePlusAlerts() {
  const { user } = useAuth();
  const { hasPlus } = usePlusAccess();
  const [alerts, setAlerts] = useState<PlusAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!user?.id || !hasPlus) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    const seen = readSeen();
    // Default window: last 7 days if nothing seen yet.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sThreads = seen.threads ?? weekAgo;
    const sEvents = seen.events ?? weekAgo;
    const sMessages = seen.messages ?? weekAgo;
    const sLibrary = seen.library ?? weekAgo;

    const [threadsR, eventsR, messagesR, libraryR] = await Promise.all([
      supabase
        .from("forum_threads")
        .select("id, title, created_at, author_id, category_id")
        .gt("created_at", sThreads)
        .neq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("events")
        .select("id, title, kind, starts_at, created_at, cancelled_at")
        .gt("created_at", sEvents)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("chat_messages")
        .select("id, thread_id, sender_id, body, created_at, chat_threads!inner(thread_type, member_a_id, member_b_id)")
        .gt("created_at", sMessages)
        .neq("sender_id", user.id)
        .eq("chat_threads.thread_type", "member_dm")
        .or(`member_a_id.eq.${user.id},member_b_id.eq.${user.id}`, { foreignTable: "chat_threads" })
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("content_items")
        .select("id, title, kind, collection_id, created_at")
        .gt("created_at", sLibrary)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const out: PlusAlert[] = [];
    (threadsR.data ?? []).forEach((t: any) => {
      out.push({
        id: `thread:${t.id}`,
        kind: "thread",
        title: "New forum thread",
        body: t.title,
        to: `/forum/thread/${t.id}`,
        createdAt: t.created_at,
      });
    });
    (eventsR.data ?? []).forEach((e: any) => {
      out.push({
        id: `event:${e.id}`,
        kind: "event",
        title: e.kind === "in_person" ? "New in-person event" : "New digital event",
        body: e.title,
        to: `/plus/events?event=${e.id}`,
        createdAt: e.created_at,
      });
    });
    (messagesR.data ?? []).forEach((m: any) => {
      const preview = (m.body ?? "").slice(0, 60);
      out.push({
        id: `msg:${m.id}`,
        kind: "message",
        title: "New STRAND+ message",
        body: preview || "Tap to open chat",
        to: `/chat/${m.thread_id}`,
        createdAt: m.created_at,
      });
    });
    (libraryR.data ?? []).forEach((it: any) => {
      out.push({
        id: `lib:${it.id}`,
        kind: "library",
        title: "New in the Library",
        body: it.title,
        to: `/plus/library/${it.collection_id}`,
        createdAt: it.created_at,
      });
    });

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setAlerts(out.slice(0, 12));
    setLoading(false);
  }, [user?.id, hasPlus]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (!user?.id || !hasPlus) return;
    const channel = supabase
      .channel("plus-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_threads" },
        () => fetchAlerts(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        () => fetchAlerts(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => fetchAlerts(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "content_items" },
        () => fetchAlerts(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "content_collections" },
        () => fetchAlerts(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, hasPlus, fetchAlerts]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    const now = new Date().toISOString();
    writeSeen({ threads: now, events: now, messages: now, library: now });
    setAlerts([]);
  }, []);

  return { alerts, loading, dismiss, dismissAll, refetch: fetchAlerts };
}
