// Global message notifications — mounted once inside the auth tree.
// - Fires an in-app top banner (via sonner) when a message arrives while
//   the user is actively using the app.
// - On session start, if there are unread messages that arrived while the
//   user was away, shows a centred popup with Dismiss / Read / Reply.
// - Drives the OS home-screen app-icon badge from the unread total.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  otherParticipantId,
  useChatThreads,
  useUnreadChatCount,
  type ChatMessage,
  type ChatThread,
} from "@/hooks/useChat";
import { useIncomingChatMessages } from "@/hooks/useIncomingChatMessages";
import { useAppBadgeSync } from "@/hooks/useAppBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const RETURN_KEY = (uid: string) => `strand.chat.lastSeen.${uid}`;
const RETURN_SHOWN_KEY = "strand.chat.returnShownThisSession";

// Broadcast an event that the global chat widget listens for so a tap on a
// notification opens the widget dropdown on the tapped thread.
export const openChatWidget = (threadId?: string) => {
  window.dispatchEvent(
    new CustomEvent("strand:open-chat-widget", { detail: { threadId } }),
  );
};

const shortPreview = (body: string) =>
  body.length > 80 ? `${body.slice(0, 77)}…` : body;

const MessageNotifications = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const { data: unread = 0 } = useUnreadChatCount();
  const { data: threads = [] } = useChatThreads();

  // Push unread total to the OS app-badge when installed.
  useAppBadgeSync(unread);

  // Active-app banner: only show when NOT already inside the thread view.
  const activeThreadId = useMemo(() => {
    const m = location.pathname.match(/^\/messages\/([^/]+)/);
    return m?.[1] ?? null;
  }, [location.pathname]);

  const threadIndex = useMemo(() => {
    const map = new Map<string, ChatThread>();
    for (const t of threads) map.set(t.id, t);
    return map;
  }, [threads]);

  // Look up display names for banner/popup senders.
  const otherIds = useMemo(() => {
    if (!user?.id) return [] as string[];
    const s = new Set<string>();
    for (const t of threads) {
      const o = otherParticipantId(t, user.id);
      if (o) s.add(o);
    }
    return Array.from(s);
  }, [threads, user?.id]);

  const nameCacheRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (otherIds.length === 0) return;
    const missing = otherIds.filter((id) => !nameCacheRef.current.has(id));
    if (missing.length === 0) return;
    (async () => {
      const [pros, profs] = await Promise.all([
        supabase.from("pro_profiles").select("user_id, display_name").in("user_id", missing),
        supabase.from("profiles").select("user_id, display_name").in("user_id", missing),
      ]);
      for (const r of pros.data ?? []) nameCacheRef.current.set(r.user_id, r.display_name ?? "Professional");
      for (const r of profs.data ?? []) {
        if (!nameCacheRef.current.has(r.user_id)) {
          nameCacheRef.current.set(r.user_id, r.display_name ?? "Member");
        }
      }
    })();
  }, [otherIds]);

  const senderNameFor = (t: ChatThread | undefined) => {
    if (!t || !user?.id) return "New message";
    if (t.thread_type === "admin_support") {
      return user.id === t.admin_user_id ? "Member" : "STRAND Team";
    }
    const otherId = otherParticipantId(t, user.id);
    return (otherId && nameCacheRef.current.get(otherId)) || "New message";
  };

  useIncomingChatMessages((m: ChatMessage) => {
    if (activeThreadId === m.thread_id) return; // Already reading it.
    const t = threadIndex.get(m.thread_id);
    const name = senderNameFor(t);
    toast(name, {
      description: shortPreview(m.body || ""),
      position: "top-center",
      duration: 4500,
      icon: <MessageCircle className="size-4 text-primary" />,
      action: {
        label: "Open",
        onClick: () => openChatWidget(m.thread_id),
      },
    });
  });

  // --- Return-to-app popup -------------------------------------------------
  const [returnState, setReturnState] = useState<{
    latest: { thread_id: string; body: string; sender_id: string | null; created_at: string };
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    if (sessionStorage.getItem(RETURN_SHOWN_KEY) === "1") return;
    let cancelled = false;
    (async () => {
      const lastSeen = localStorage.getItem(RETURN_KEY(user.id));
      if (!lastSeen) return; // First-ever open: no missed-message popup.
      const { data: myThreads } = await supabase
        .from("chat_threads")
        .select("id")
        .or(`pro_user_id.eq.${user.id},consumer_id.eq.${user.id},admin_user_id.eq.${user.id},subject_user_id.eq.${user.id}`);
      const ids = (myThreads ?? []).map((t) => t.id);
      if (ids.length === 0) return;
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("thread_id, body, sender_id, created_at, kind, read_at")
        .in("thread_id", ids)
        .neq("sender_id", user.id)
        .is("read_at", null)
        .gt("created_at", lastSeen)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const textMsgs = (msgs ?? []).filter((m) => m.kind === "text");
      if (textMsgs.length === 0) return;
      const latest = textMsgs[0];
      sessionStorage.setItem(RETURN_SHOWN_KEY, "1");
      setReturnState({
        latest: {
          thread_id: latest.thread_id,
          body: latest.body ?? "",
          sender_id: latest.sender_id,
          created_at: latest.created_at,
        },
        count: textMsgs.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Update the "last seen" watermark whenever the total unread drops to 0.
  useEffect(() => {
    if (!user?.id) return;
    if (unread === 0) {
      localStorage.setItem(RETURN_KEY(user.id), new Date().toISOString());
    }
  }, [unread, user?.id]);

  if (!user?.id) return null;

  const dismiss = () => setReturnState(null);
  const openWidget = () => {
    if (!returnState) return;
    openChatWidget(returnState.latest.thread_id);
    dismiss();
  };
  const openThread = () => {
    if (!returnState) return;
    nav(`/messages/${returnState.latest.thread_id}`);
    dismiss();
  };

  const senderName = returnState
    ? senderNameFor(threadIndex.get(returnState.latest.thread_id))
    : "";

  return (
    <Dialog open={!!returnState} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-[320px] p-5 rounded-[18px]">
        <DialogHeader className="space-y-2">
          <DialogTitle className="font-display text-lg text-center">
            {returnState && returnState.count > 1
              ? `${returnState.count} new messages`
              : "New message"}
          </DialogTitle>
          <DialogDescription className="text-center text-xs">
            {senderName ? `From ${senderName}` : "You were away"}
          </DialogDescription>
        </DialogHeader>
        {returnState && (
          <div className="mt-1 p-3 rounded-[12px] bg-muted/50 border border-border/50">
            <p className="text-[13px] font-body text-foreground leading-snug break-words">
              {shortPreview(returnState.latest.body)}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={openThread} className="w-full">Reply</Button>
          <Button variant="outline" onClick={openWidget} className="w-full">Read</Button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-muted-foreground hover:underline font-body pt-1"
          >
            Dismiss
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessageNotifications;
