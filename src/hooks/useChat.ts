import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isValidBookingUrl, normalizeBookingUrl } from "@/lib/bookingUrl";
import { prepareImageForAi } from "@/lib/imagePrep";
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
  sender_role: string | null;
  kind: "text" | "system" | "booking_request";
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

/**
 * Which side of a thread am I sitting on right now?
 * Multi-role accounts (e.g. an admin who is also a professional and a member)
 * can occupy BOTH sides of the same thread. In that case the active role view
 * decides who "I" am, so the professional view sees the member's messages as
 * incoming (brown) and its own as outgoing (gold).
 */
export function mySideRole(
  t: Pick<ChatThread, "thread_type" | "consumer_id" | "pro_user_id" | "admin_user_id" | "subject_user_id">,
  myId: string,
  view: ActiveRoleView,
): "pro" | "consumer" | "admin" | "subject" {
  if (t.thread_type === "admin_support") {
    if (t.admin_user_id === myId && t.subject_user_id === myId) {
      return view === "admin" ? "admin" : "subject";
    }
    return t.admin_user_id === myId ? "admin" : "subject";
  }
  if (t.pro_user_id === myId && t.consumer_id === myId) {
    return view === "pro" || view === "admin" ? "pro" : "consumer";
  }
  return t.pro_user_id === myId ? "pro" : "consumer";
}

/** Is this message mine, from the perspective of the side I'm viewing as? */
export function messageIsMine(
  m: Pick<ChatMessage, "sender_id" | "sender_role">,
  t: Pick<ChatThread, "thread_type" | "consumer_id" | "pro_user_id" | "admin_user_id" | "subject_user_id">,
  myId: string,
  view: ActiveRoleView,
): boolean {
  if (m.sender_id !== myId) return false;
  const side = mySideRole(t, myId, view);
  const bothSides =
    t.thread_type === "admin_support"
      ? t.admin_user_id === myId && t.subject_user_id === myId
      : t.pro_user_id === myId && t.consumer_id === myId;
  if (!bothSides) return true;
  // Legacy rows with no sender_role are attributed to the consumer side so
  // the professional view still renders them as incoming.
  const senderSide =
    m.sender_role === "pro" || m.sender_role === "admin" ? m.sender_role : "consumer";
  if (side === "subject") return senderSide === "consumer";
  return senderSide === side;

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
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    gcTime: 10 * 60_000,
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
    // Strict role separation: a thread she started as a consumer must never
    // appear in the professional view (and vice versa), even when the account
    // holds both roles and the current view has no threads of its own.
    return query.data.filter((t) => threadMatchesView(t, user.id, view));
  }, [query.data, user?.id, view]);

  return { ...query, data: filtered } as typeof query;
}

export interface ChatThreadMeta {
  preview: string;
  preview_mine: boolean;
  preview_read: boolean;
  preview_sender_id: string | null;
  preview_sender_role: string | null;
  unread: number;
}


/**
 * Shared last-message + unread map for a set of threads.
 * One cache entry serves the Messages list AND the global chat widget, so
 * switching between them is instant. Deliberately two small queries instead
 * of pulling every message ever sent: the previews query is capped, and the
 * unread query only touches rows that are still unread.
 */
export function useChatThreadMeta(threads: ChatThread[] | undefined) {
  const { user } = useAuth();
  const view = useActiveRoleView();
  const ids = useMemo(
    () => (threads ?? []).map((t) => t.id).sort(),
    [threads],
  );
  return useQuery({
    queryKey: ["chat_thread_meta", user?.id, view, ids.join(",")],
    enabled: !!user?.id && ids.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Map<string, ChatThreadMeta>> => {
      const byId = new Map((threads ?? []).map((t) => [t.id, t]));
      const isMine = (m: { sender_id: string | null; sender_role: string | null; thread_id: string }) => {
        const t = byId.get(m.thread_id);
        return t ? messageIsMine(m, t, user!.id, view) : m.sender_id === user!.id;
      };

      const [previewRes, unreadRes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("thread_id, body, sender_id, sender_role, read_at, kind, created_at")
          .in("thread_id", ids)
          .in("kind", ["text", "booking_request"])
          .order("created_at", { ascending: false })
          .limit(Math.min(400, ids.length * 12)),
        supabase
          .from("chat_messages")
          .select("thread_id, sender_id, sender_role")
          .in("thread_id", ids)
          .is("read_at", null)
          .not("sender_id", "is", null),
      ]);

      const meta = new Map<string, ChatThreadMeta>();
      const get = (id: string): ChatThreadMeta =>
        meta.get(id) ?? {
          preview: "",
          preview_mine: false,
          preview_read: false,
          preview_sender_id: null,
          preview_sender_role: null,
          unread: 0,
        };

      for (const m of previewRes.data ?? []) {
        const cur = get(m.thread_id);
        if (!cur.preview) {
          cur.preview = m.body ?? "";
          cur.preview_mine = isMine(m);
          cur.preview_read = !!m.read_at;
          cur.preview_sender_id = m.sender_id ?? null;
          cur.preview_sender_role = m.sender_role ?? null;
        }
        meta.set(m.thread_id, cur);
      }

      for (const m of unreadRes.data ?? []) {
        const cur = get(m.thread_id);
        // Only messages from someone else can be unread for me.
        if (m.sender_id !== user!.id) cur.unread += 1;
        meta.set(m.thread_id, cur);
      }

      return meta;
    },
  });
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
      .channel(`chat_thread_${threadId}_${Math.random().toString(36).slice(2)}`)
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
  const view = useActiveRoleView();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!threadId || !user?.id) throw new Error("Not ready");
      const text = body.trim();
      if (!text) throw new Error("Empty message");
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        sender_role: view,
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

/**
 * Sends an image inside a thread.
 *
 * The file is re-encoded to JPEG (so iPhone HEIC works) and uploaded into the
 * private `chat-images` bucket under the thread id, which is what the storage
 * policies key off. The message row carries kind = "image" with the storage
 * path in `meta`; `body` holds the optional caption so notification and
 * preview surfaces still have readable text.
 */
export function useSendChatImage(threadId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const view = useActiveRoleView();
  return useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      if (!threadId || !user?.id) throw new Error("Not ready");
      const prepared = await prepareImageForAi(file);
      const path = `${threadId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("chat-images")
        .upload(path, prepared.uploadFile, {
          contentType: prepared.uploadFile.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        sender_role: view,
        kind: "image",
        body: caption?.trim() || "Photo",
        meta: { image_path: path, width: prepared.width, height: prepared.height },
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
  const view = useActiveRoleView();
  return useMutation({
    mutationFn: async () => {
      if (!threadId || !user?.id) return;
      const stamp = new Date().toISOString();
      await supabase
        .from("chat_messages")
        .update({ read_at: stamp })
        .eq("thread_id", threadId)
        // `neq` skips NULL sender rows (system notices), so include them
        // explicitly — otherwise they linger as permanent unread.
        .or(`sender_id.is.null,sender_id.neq.${user.id}`)
        .is("read_at", null);
      // Multi-role accounts can sit on both sides of a thread: mark the
      // opposite side's own messages read too, so ticks still turn blue.
      const { data: t } = await supabase
        .from("chat_threads")
        .select("thread_type, consumer_id, pro_user_id, admin_user_id, subject_user_id")
        .eq("id", threadId)
        .maybeSingle();
      const bothSides = t
        ? t.thread_type === "admin_support"
          ? t.admin_user_id === user.id && t.subject_user_id === user.id
          : t.pro_user_id === user.id && t.consumer_id === user.id
        : false;
      if (bothSides) {
        const mine = view === "admin" ? "admin" : view;
        // Legacy rows (sender_role null) count as the consumer side, so they
        // must also clear when the other side opens the thread — `neq` alone
        // would skip nulls and leave a badge that never goes away.
        await supabase
          .from("chat_messages")
          .update({ read_at: stamp })
          .eq("thread_id", threadId)
          .eq("sender_id", user.id)
          .or(`sender_role.is.null,sender_role.neq.${mine}`)
          .is("read_at", null);
      }

    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat_unread", user?.id] });
      // Per-thread unread pills on the Messages list.
      qc.invalidateQueries({ queryKey: ["chat_thread_meta"] });
      qc.invalidateQueries({ queryKey: ["chat_widget_previews"] });
      qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
      // Home 2x2 grid / STRAND+ message badge listens for this.
      try { window.dispatchEvent(new CustomEvent("chat-thread-read")); } catch { /* noop */ }
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
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<number> => {
      const { data: rows } = await supabase
        .from("chat_threads")
        .select("id, thread_type, consumer_id, pro_user_id, admin_user_id, subject_user_id, subject_role")
        .or(threadOrFilter(user!.id));
      const inView = (rows ?? []).filter((t) =>
        view === "all" ? true : threadMatchesView(t as never, user!.id, view),
      );
      // Badges follow the same strict role separation as the inbox: a
      // consumer-side message never pings the professional view.
      const scoped = inView;
      const ids = scoped.map((t) => t.id);
      if (ids.length === 0) return 0;

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("thread_id, sender_id, sender_role")
        .in("thread_id", ids)
        .is("read_at", null)
        // System rows (sender_id null) are not "received messages".
        .not("sender_id", "is", null);
      // A message I sent is never "unread" for me — even on a multi-role
      // account viewing the thread from the other side.
      return (msgs ?? []).filter((m) => m.sender_id !== user!.id).length;

    },
  });
}


/**
 * The booking page link of the professional in a pro–client thread.
 * Drives the persistent "Book appointment" button for the client, and the
 * "add your link" nudge the professional sees when it's missing.
 */
export function useProBookingUrl(proUserId: string | null | undefined) {
  return useQuery({
    queryKey: ["pro_booking_url", proUserId],
    enabled: !!proUserId,
    staleTime: 60_000,
    queryFn: async (): Promise<{
      url: string | null;
      proName: string;
      discountCode: string | null;
      discountDescription: string | null;
    }> => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .select(
          "booking_url, display_name, discount_code, discount_description, discount_active",
        )
        .eq("user_id", proUserId!)
        .maybeSingle();
      if (error) throw error;
      const url = (data?.booking_url ?? "").trim();
      // A discount only exists for the member when the pro has switched it on.
      const active = data?.discount_active === true;
      const code = active ? (data?.discount_code ?? "").trim() : "";
      return {
        url: url || null,
        proName: data?.display_name ?? "",
        discountCode: code || null,
        discountDescription: code
          ? (data?.discount_description ?? "").trim() || null
          : null,
      };
    },
  });
}

/** Pro-only: post a structured booking-request card into the thread. */
export function useSendBookingRequest(threadId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const view = useActiveRoleView();
  return useMutation({
    mutationFn: async (input: { bookingUrl: string; proName: string; note?: string }) => {
      if (!threadId || !user?.id) throw new Error("Not ready");
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        sender_role: view,
        kind: "booking_request",
        body: `${input.proName} invites you to book`,
        meta: {
          booking_url: input.bookingUrl,
          pro_name: input.proName,
          note: input.note?.trim() || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
    },
  });
}

/**
 * Find the pro↔client thread for one of my clients (professional side).
 * Used by the Clients book so "Message client" lands in the same thread the
 * accepted enquiry opened.
 */
export function useFindClientThread() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (consumerId: string): Promise<string | null> => {
      if (!user?.id) throw new Error("Not ready");
      const { data } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("thread_type", "client_pro")
        .eq("pro_user_id", user.id)
        .eq("consumer_id", consumerId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data?.id ?? null;
    },
  });
}

/**
 * Professional-side: post my saved booking page link into the thread I share
 * with a client, straight from the client book. The client is the one who
 * books and logs the appointment, so the pro only ever sends the link.
 */
export function useSendBookingLinkToClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const view = useActiveRoleView();
  return useMutation({
    mutationFn: async (consumerId: string): Promise<string> => {
      if (!user?.id) throw new Error("Not ready");
      const { data: profile } = await supabase
        .from("pro_profiles")
        .select("booking_url, display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const url = normalizeBookingUrl(profile?.booking_url ?? "");
      if (!isValidBookingUrl(url)) {
        throw new Error("Add your booking page link in your profile first");
      }
      const { data: thread } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("thread_type", "client_pro")
        .eq("pro_user_id", user.id)
        .eq("consumer_id", consumerId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!thread?.id) throw new Error("No chat open with this client yet");
      const proName = (profile?.display_name ?? "").trim() || "Your professional";
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: thread.id,
        sender_id: user.id,
        sender_role: view,
        kind: "booking_request",
        body: `${proName} invites you to book`,
        meta: { booking_url: url, pro_name: proName, note: null },
      });
      if (error) throw error;
      return thread.id;
    },
    onSuccess: (threadId) => {
      qc.invalidateQueries({ queryKey: ["chat_messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
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

