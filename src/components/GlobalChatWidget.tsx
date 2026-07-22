// Global chat widget — top-bar entry point available on every screen for
// consumer, pro and admin views. Shows an unread badge, opens a dropdown
// listing every conversation the current user is a participant in, and lets
// them expand a thread inline for a quick reply without navigating away.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { directoryLinkForPro } from "@/lib/directoryLink";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, ArrowRight, ChevronLeft, Send, BadgeCheck, Minus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ProAvatar from "@/components/ProAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  otherParticipantId,
  useChatThreads,
  useChatThread,
  useMarkThreadRead,
  useSendChatMessage,
  useUnreadChatCount,
  type ChatThread,
} from "@/hooks/useChat";

// Hide on splash / auth / restricted screens (parity with GlobalMenu).
const HIDDEN_PREFIXES = ["/auth", "/.lovable"];

const GlobalChatWidget = () => {
  const { user, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: unread = 0 } = useUnreadChatCount();
  const { data: threads = [], isLoading } = useChatThreads();

  const hidden =
    !session ||
    location.pathname === "/" ||
    HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  // Reset expanded thread when panel closes.
  useEffect(() => {
    if (!open) setExpandedId(null);
  }, [open]);

  // React to global "open chat widget" events (from message toasts and the
  // return-to-app popup). Opens the popover and pre-expands the thread if
  // provided.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId?: string }>).detail;
      setOpen(true);
      if (detail?.threadId) setExpandedId(detail.threadId);
    };
    window.addEventListener("strand:open-chat-widget", onOpen as EventListener);
    return () => window.removeEventListener("strand:open-chat-widget", onOpen as EventListener);
  }, []);

  const { pros, consumers } = useMemo(() => {
    if (!user?.id) return { pros: [] as string[], consumers: [] as string[] };
    const pros = new Set<string>();
    const consumers = new Set<string>();
    for (const t of threads) {
      if (t.thread_type === "admin_support") continue;
      if (t.pro_user_id === user.id && t.consumer_id) consumers.add(t.consumer_id);
      else if (t.pro_user_id) pros.add(t.pro_user_id);
    }
    return { pros: Array.from(pros), consumers: Array.from(consumers) };
  }, [threads, user?.id]);

  const { data: nameMap } = useQuery({
    queryKey: ["chat_widget_names", pros, consumers],
    enabled: (pros.length + consumers.length) > 0,
    queryFn: async () => {
      const m = new Map<string, { name: string; avatar_path: string | null }>();
      if (pros.length) {
        const { data } = await supabase
          .from("pro_profiles")
          .select("user_id, display_name, avatar_path")
          .in("user_id", pros);
        for (const r of data ?? []) {
          m.set(r.user_id, {
            name: r.display_name ?? "Professional",
            avatar_path: r.avatar_path ?? null,
          });
        }
      }
      if (consumers.length) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", consumers);
        for (const r of data ?? []) {
          m.set(r.user_id, { name: r.display_name ?? "Client", avatar_path: null });
        }
      }
      return m;
    },
  });

  // Latest message + per-thread unread count for the collapsed list.
  const { data: previewMap } = useQuery({
    queryKey: ["chat_widget_previews", user?.id, threads.map((t) => t.id).join(",")],
    enabled: !!user?.id && threads.length > 0,
    queryFn: async () => {
      const ids = threads.map((t) => t.id);
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("thread_id, body, sender_id, read_at, created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });
      const preview = new Map<string, { snippet: string; unread: number }>();
      for (const m of msgs ?? []) {
        const cur = preview.get(m.thread_id) ?? { snippet: "", unread: 0 };
        if (!cur.snippet) cur.snippet = m.body ?? "";
        if (m.sender_id !== user?.id && !m.read_at) cur.unread += 1;
        preview.set(m.thread_id, cur);
      }
      return preview;
    },
    // Refetch whenever the widget opens to keep counts fresh.
    refetchInterval: open ? 15_000 : false,
  });

  if (hidden) return null;

  const displayFor = (t: ChatThread) => {
    if (t.thread_type === "admin_support") {
      const isAdminSide = user?.id === t.admin_user_id;
      return {
        name: isAdminSide ? "STRAND Team ↔ member" : "STRAND Team",
        avatar: null as string | null,
        isSupport: true,
      };
    }
    const otherId = user?.id ? otherParticipantId(t, user.id) : null;
    const other = otherId ? nameMap?.get(otherId) : null;
    return {
      name: other?.name ?? "Conversation",
      avatar: other?.avatar_path ?? null,
      isSupport: false,
    };
  };

  const expanded = expandedId ? threads.find((t) => t.id === expandedId) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Messages${unread > 0 ? ` (${unread} unread)` : ""}`}
          className="relative size-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors"
        >
          <MessageCircle className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-body font-semibold leading-none">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[320px] p-0 border border-border/60"
      >
        {!expanded ? (
          <div className="flex flex-col max-h-[420px]">
            <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
              <p className="font-display text-sm font-semibold">Messages</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/messages");
                }}
                className="text-[11px] font-body text-primary hover:underline"
              >
                See all
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : threads.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <MessageCircle className="size-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No conversations yet
                  </p>
                </div>
              ) : (
                threads.map((t) => {
                  const d = displayFor(t);
                  const preview = previewMap?.get(t.id);
                  const snippet = preview?.snippet ?? "";
                  const u = preview?.unread ?? 0;
                  const last = t.last_message_at ?? t.created_at;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setExpandedId(t.id)}
                      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-muted/40 border-b border-border/40 last:border-b-0"
                    >
                      {d.isSupport ? (
                        <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                          <BadgeCheck className="size-4" />
                        </div>
                      ) : (
                        <ProAvatar
                          name={d.name}
                          photoUrl={d.avatar ?? undefined}
                          size="size-9"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-body text-[13px] font-semibold leading-tight truncate flex-1">
                            {d.name}
                          </p>
                          {u > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold leading-none">
                              {u}
                            </span>
                          )}
                        </div>
                        {snippet && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {snippet}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                          {formatDistanceToNow(new Date(last), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <ThreadQuickView
            thread={expanded}
            display={displayFor(expanded)}
            onBack={() => setExpandedId(null)}
            onMinimise={() => setOpen(false)}
            onOpenFull={() => {
              setOpen(false);
              navigate(`/messages/${expanded.id}`);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

// Inline conversation view: last few messages + quick reply.
const ThreadQuickView = ({
  thread,
  display,
  onBack,
  onMinimise,
  onOpenFull,
}: {
  thread: ChatThread;
  display: { name: string; avatar: string | null; isSupport: boolean };
  onBack: () => void;
  onMinimise: () => void;
  onOpenFull: () => void;
}) => {
  const { user } = useAuth();
  const { messages } = useChatThread(thread.id);
  const send = useSendChatMessage(thread.id);
  const markRead = useMarkThreadRead(thread.id);
  const [draft, setDraft] = useState("");

  // Mark as read when opened.
  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const recent = (messages.data ?? []).slice(-6);
  const submit = async () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    setDraft("");
    try {
      await send.mutateAsync(text);
    } catch (err) {
      console.error("quick reply failed", err);
    }
  };

  // Role tag for the other person, shown next to their name.
  const roleTag =
    display.isSupport ? "STRAND Team"
    : thread.thread_type === "client_pro" && thread.pro_user_id === user?.id
      ? "Member"
      : "Pro";

  // When the consumer is chatting with a pro, tapping the name/avatar
  // deep-links to the directory anchored on that pro's card.
  const nav = useNavigate();
  const proLinkId =
    !display.isSupport &&
    thread.thread_type === "client_pro" &&
    thread.pro_user_id &&
    thread.pro_user_id !== user?.id
      ? thread.pro_user_id
      : null;

  return (
    <div className="flex flex-col max-h-[460px]">
      <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="size-7 rounded-full flex items-center justify-center hover:bg-muted"
          aria-label="Back to conversations"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => proLinkId && nav(directoryLinkForPro(proLinkId))}
          disabled={!proLinkId}
          className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-default"
          aria-label={proLinkId ? `View ${display.name} in directory` : undefined}
        >
          {display.isSupport ? (
            <div className="size-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <BadgeCheck className="size-3.5" />
            </div>
          ) : (
            <ProAvatar name={display.name} photoUrl={display.avatar ?? undefined} size="size-7" />
          )}
          <div className="min-w-0 flex items-center gap-1.5">
            <p className={`text-[13px] font-body font-semibold truncate ${proLinkId ? "underline underline-offset-2 decoration-primary/40" : ""}`}>
              {display.name}
            </p>
            <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-primary/12 text-primary font-body font-semibold shrink-0">
              {roleTag}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={onMinimise}
          aria-label="Minimise chat"
          className="size-7 rounded-full flex items-center justify-center text-foreground/70 hover:bg-muted"
        >
          <Minus className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No messages yet — say hello.
          </p>
        ) : (
          recent.map((m) => {
            const mine = m.sender_id === user?.id;
            if (m.kind === "system") {
              const apptId = (m.meta as { appointment_id?: string } | null)?.appointment_id;
              if (apptId) {
                const iAmPro = thread.pro_user_id === user?.id;
                const target = iAmPro ? `/pro/appointments?appt=${apptId}` : `/appointments?appt=${apptId}`;
                return (
                  <div key={m.id} className="flex justify-center py-1">
                    <button
                      type="button"
                      onClick={() => nav(target)}
                      className="inline-flex items-center gap-1.5 text-[10.5px] font-body text-primary bg-primary/10 hover:bg-primary/15 px-2.5 py-1 rounded-full"
                    >
                      <Calendar className="size-3" />
                      <span>{m.body}</span>
                      <span className="text-[9px] uppercase tracking-[0.1em] opacity-70">View</span>
                    </button>
                  </div>
                );
              }
              return (
                <p key={m.id} className="text-[10px] text-muted-foreground italic text-center px-2 py-1">
                  {m.body}
                </p>
              );
            }
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-[12.5px] leading-snug font-body break-words ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-brown text-brown-foreground rounded-bl-sm"
                  }`}

                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="border-t border-border/60 p-2 flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Quick reply…"
          className="flex-1 px-3 py-2 rounded-full bg-muted/50 border border-transparent focus:border-primary/40 focus:outline-none text-[12.5px] font-body"
        />
        <button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          aria-label="Send"
          className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
        >
          <Send className="size-3.5" />
        </button>
      </form>
      <button
        type="button"
        onClick={onOpenFull}
        className="border-t border-border/60 py-2.5 text-[11.5px] font-body font-semibold uppercase tracking-[0.1em] text-primary flex items-center justify-center gap-1.5 hover:bg-primary/5"
      >
        Open full chat
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
};

export default GlobalChatWidget;
