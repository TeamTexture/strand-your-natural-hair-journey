// STRAND+ activity alerts. Notifies members of new threads, replies,
// events, library uploads, and direct messages from other STRAND+ members
// since their last visit to the relevant surface. Powered by Realtime so
// each tile updates live while the app is open, then falls back to a
// fetch on mount.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlusAccess } from "@/hooks/usePlusAccess";

export type PlusAlertKind = "thread" | "event" | "message" | "library";
export type PlusSurface = "forum" | "events" | "messages" | "library";

export interface PlusAlert {
  id: string;
  kind: PlusAlertKind;
  title: string;
  body: string;
  to: string;
  createdAt: string;
}

export interface PlusAlertCounts {
  forum: number;
  events: number;
  messages: number;
  library: number;
}

const SEEN_KEY = "strand_plus_seen_v1";
type SeenMap = {
  threads?: string;
  events?: string;
  messages?: string;
  library?: string;
  forum?: string;
};

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
  // Fire a same-tab event so open hooks refetch immediately.
  try { window.dispatchEvent(new CustomEvent("plus-alerts-seen", { detail: surface })); } catch {}
};

export function usePlusAlerts() {
  const { user } = useAuth();
  const { hasPlus } = usePlusAccess();
  const [alerts, setAlerts] = useState<PlusAlert[]>([]);
  const [counts, setCounts] = useState<PlusAlertCounts>({ forum: 0, events: 0, messages: 0, library: 0 });
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!user?.id || !hasPlus) {
      setAlerts([]);
      setCounts({ forum: 0, events: 0, messages: 0, library: 0 });
      setLoading(false);
      return;
    }
    const seen = readSeen();
    // Default window: last 7 days if nothing seen yet.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sForum = seen.forum ?? seen.threads ?? weekAgo;
    const sEvents = seen.events ?? weekAgo;
    const sMessages = seen.messages ?? weekAgo;
    const sLibrary = seen.library ?? weekAgo;

    const [threadsR, repliesR, eventsR, messagesR, libraryItemsR, libraryColR] = await Promise.all([
      supabase
        .from("forum_threads")
        .select("id, title, created_at, author_id")
        .gt("created_at", sForum)
        .neq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("forum_replies")
        .select("id, thread_id, author_id, body, created_at")
        .gt("created_at", sForum)
        .neq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("events")
        .select("id, title, kind, starts_at, created_at, cancelled_at")
        .gt("created_at", sEvents)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("chat_messages")
        .select("id, thread_id, sender_id, body, created_at, chat_threads!inner(thread_type, member_a_id, member_b_id)")
        .gt("created_at", sMessages)
        .neq("sender_id", user.id)
        .eq("chat_threads.thread_type", "member_dm")
        .or(`member_a_id.eq.${user.id},member_b_id.eq.${user.id}`, { foreignTable: "chat_threads" })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("content_items")
        .select("id, title, kind, collection_id, created_at")
        .gt("created_at", sLibrary)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("content_collections")
        .select("id, title, created_at, is_published")
        .gt("created_at", sLibrary)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const threads = threadsR.data ?? [];
    const replies = repliesR.data ?? [];
    const events = eventsR.data ?? [];
    const messages = messagesR.data ?? [];
    const libItems = libraryItemsR.data ?? [];
    const libCols = libraryColR.data ?? [];

    const out: PlusAlert[] = [];
    threads.forEach((t: any) => out.push({
      id: `thread:${t.id}`, kind: "thread",
      title: "New forum thread", body: t.title,
      to: `/forum/thread/${t.id}`, createdAt: t.created_at,
    }));
    replies.forEach((r: any) => out.push({
      id: `reply:${r.id}`, kind: "thread",
      title: "New forum reply", body: (r.body ?? "").slice(0, 80) || "Tap to open thread",
      to: `/forum/thread/${r.thread_id}`, createdAt: r.created_at,
    }));
    events.forEach((e: any) => out.push({
      id: `event:${e.id}`, kind: "event",
      title: e.kind === "in_person" ? "New in-person event" : "New digital event",
      body: e.title, to: `/plus/events?event=${e.id}`, createdAt: e.created_at,
    }));
    messages.forEach((m: any) => out.push({
      id: `msg:${m.id}`, kind: "message",
      title: "New STRAND+ message",
      body: (m.body ?? "").slice(0, 60) || "Tap to open chat",
      to: `/chat/${m.thread_id}`, createdAt: m.created_at,
    }));
    libItems.forEach((it: any) => out.push({
      id: `lib:${it.id}`, kind: "library",
      title: "New in the Library", body: it.title,
      to: `/plus/library/${it.collection_id}`, createdAt: it.created_at,
    }));
    libCols.forEach((c: any) => out.push({
      id: `libcol:${c.id}`, kind: "library",
      title: "New library collection", body: c.title,
      to: `/plus/library/${c.id}`, createdAt: c.created_at,
    }));

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setAlerts(out.slice(0, 20));
    setCounts({
      forum: threads.length + replies.length,
      events: events.length,
      messages: messages.length,
      library: libItems.length + libCols.length,
    });
    setLoading(false);
  }, [user?.id, hasPlus]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  useEffect(() => {
    const h = () => fetchAlerts();
    window.addEventListener("plus-alerts-seen", h);
    return () => window.removeEventListener("plus-alerts-seen", h);
  }, [fetchAlerts]);

  useEffect(() => {
    if (!user?.id || !hasPlus) return;
    const channel = supabase
      .channel("plus-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_threads" }, () => fetchAlerts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_replies" }, () => fetchAlerts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, () => fetchAlerts())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, () => fetchAlerts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => fetchAlerts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "content_items" }, () => fetchAlerts())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "content_items" }, () => fetchAlerts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "content_collections" }, () => fetchAlerts())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "content_collections" }, () => fetchAlerts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, hasPlus, fetchAlerts]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    const now = new Date().toISOString();
    writeSeen({ threads: now, forum: now, events: now, messages: now, library: now });
    setAlerts([]);
    setCounts({ forum: 0, events: 0, messages: 0, library: 0 });
  }, []);

  return { alerts, counts, loading, dismiss, dismissAll, refetch: fetchAlerts };
}
