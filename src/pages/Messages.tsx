import { useEffect, useMemo } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BadgeCheck } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import DeliveryTicks from "@/components/chat/DeliveryTicks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { otherParticipantId, useChatThreads } from "@/hooks/useChat";

const Messages = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: threads, isLoading } = useChatThreads();

  const { pros, consumers } = useMemo(() => {
    if (!user?.id || !threads) return { pros: [] as string[], consumers: [] as string[] };
    const pros = new Set<string>();
    const consumers = new Set<string>();
    for (const t of threads) {
      if (t.thread_type === "admin_support") continue;
      if (t.pro_user_id === user.id && t.consumer_id) consumers.add(t.consumer_id);
      else if (t.pro_user_id) pros.add(t.pro_user_id);
    }
    return { pros: Array.from(pros), consumers: Array.from(consumers) };
  }, [threads, user?.id]);

  // Names for the "other side" of each thread. For pro-side rows we
  // deliberately omit the client's postcode from the visible metadata.
  const { data: nameMap } = useQuery({
    queryKey: ["chat_thread_names_v2", pros, consumers],
    enabled: (pros.length + consumers.length) > 0,
    queryFn: async () => {
      const m = new Map<string, { name: string; sub: string | null; avatar_path: string | null }>();
      if (pros.length) {
        const { data } = await supabase
          .from("pro_profiles")
          .select("user_id, display_name, discipline, location, avatar_path")
          .in("user_id", pros);
        for (const r of data ?? []) {
          m.set(r.user_id, {
            name: r.display_name ?? "Professional",
            sub: [r.discipline, r.location].filter(Boolean).join(" · ") || null,
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
          // No postcode — clients get name + relationship tag only.
          m.set(r.user_id, {
            name: r.display_name ?? "Client",
            sub: null,
            avatar_path: null,
          });
        }
      }
      return m;
    },
  });

  // For pro-side threads, determine "New enquiry" vs "New client": if the
  // pro has any appointment linked to this consumer, they're a client.
  const proSideConsumers = useMemo(() => {
    if (!user?.id || !threads) return [] as string[];
    const out = new Set<string>();
    for (const t of threads) {
      if (t.thread_type === "client_pro" && t.pro_user_id === user.id && t.consumer_id) {
        out.add(t.consumer_id);
      }
    }
    return Array.from(out);
  }, [threads, user?.id]);

  const { data: clientTagMap } = useQuery({
    queryKey: ["chat_client_tags", user?.id, proSideConsumers],
    enabled: !!user?.id && proSideConsumers.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("user_id")
        .eq("linked_pro_user_id", user!.id)
        .in("user_id", proSideConsumers);
      const withAppt = new Set<string>();
      for (const r of data ?? []) if (r.user_id) withAppt.add(r.user_id);
      const m = new Map<string, "new_enquiry" | "new_client">();
      for (const c of proSideConsumers) m.set(c, withAppt.has(c) ? "new_client" : "new_enquiry");
      return m;
    },
  });

  // Last message + unread count per thread.
  const { data: threadMeta } = useQuery({
    queryKey: ["chat_thread_meta", user?.id, threads?.map((t) => t.id).join(",")],
    enabled: !!user?.id && !!threads && threads.length > 0,
    queryFn: async () => {
      const ids = (threads ?? []).map((t) => t.id);
      const { data } = await supabase
        .from("chat_messages")
        .select("thread_id, body, sender_id, read_at, kind, created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });
      const meta = new Map<string, {
        preview: string;
        preview_mine: boolean;
        preview_read: boolean;
        unread: number;
      }>();
      for (const m of data ?? []) {
        const cur = meta.get(m.thread_id) ?? {
          preview: "",
          preview_mine: false,
          preview_read: false,
          unread: 0,
        };
        if (!cur.preview && m.kind === "text") {
          cur.preview = m.body ?? "";
          cur.preview_mine = m.sender_id === user!.id;
          cur.preview_read = !!m.read_at;
        }
        if (m.sender_id !== user!.id && m.sender_id !== null && !m.read_at) {
          cur.unread += 1;
        }
        meta.set(m.thread_id, cur);
      }
      return meta;
    },
  });

  return (
    <ScreenLayout>
      <TitleBar title="Messages" onBack={() => nav(-1)} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Direct conversations open once an enquiry is accepted, and with STRAND Team.
        </p>
      </div>

      <div className="px-5 pb-8 space-y-2.5">
        {isLoading ? (
          <LoadingDot label="Loading messages…" fullScreen={false} />
        ) : !threads || threads.length === 0 ? (
          <EmptyState
            icon="💬"
            message="No conversations yet"
            hint="Accepted enquiries open a chat here."
          />
        ) : (
          threads.map((t) => {
            const isSupport = t.thread_type === "admin_support";
            const isProSide = t.thread_type === "client_pro" && t.pro_user_id === user?.id;
            const otherId = user?.id ? otherParticipantId(t, user.id) : null;
            const other = otherId ? nameMap?.get(otherId) : null;
            const meta = threadMeta?.get(t.id);
            const unread = meta?.unread ?? 0;
            const last = t.last_message_at ?? t.created_at;
            const displayName = isSupport ? "STRAND Team" : (other?.name ?? "Conversation");
            const sub = isSupport
              ? "Support & guidance"
              : isProSide
                ? null // pro-side: hide postcode; use relationship tag below
                : other?.sub ?? null;
            const tag = isProSide && otherId
              ? clientTagMap?.get(otherId)
              : undefined;

            return (
              <SurfaceCard
                key={t.id}
                onClick={() => nav(`/messages/${t.id}`)}
                className="cursor-pointer hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  {isSupport ? (
                    <div className="size-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <BadgeCheck className="size-5" />
                    </div>
                  ) : (
                    <ProAvatar
                      name={other?.name ?? "?"}
                      photoUrl={other?.avatar_path ?? undefined}
                      size="size-11"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-display text-sm font-semibold leading-tight truncate">
                        {displayName}
                      </p>
                      {isSupport && (
                        <span className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-body font-semibold">
                          Official
                        </span>
                      )}
                      {tag === "new_enquiry" && (
                        <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-warn/20 text-warn font-body font-semibold">
                          New enquiry
                        </span>
                      )}
                      {tag === "new_client" && (
                        <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-good/20 text-good font-body font-semibold">
                          New client
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
                    {meta?.preview && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {meta.preview_mine && (
                          <DeliveryTicks readAt={meta.preview_read ? "read" : null} />
                        )}
                        <p className="text-[11.5px] text-muted-foreground truncate">
                          {meta.preview_mine ? "You: " : ""}{meta.preview}
                        </p>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                      {formatDistanceToNow(new Date(last), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </SurfaceCard>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default Messages;
