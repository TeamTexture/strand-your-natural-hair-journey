import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatThreads } from "@/hooks/useChat";

const Messages = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: threads, isLoading } = useChatThreads();

  const otherIds = useMemo(() => {
    if (!user?.id || !threads) return { pros: [] as string[], consumers: [] as string[] };
    const pros = new Set<string>();
    const consumers = new Set<string>();
    for (const t of threads) {
      if (t.pro_user_id === user.id) consumers.add(t.consumer_id);
      else pros.add(t.pro_user_id);
    }
    return { pros: Array.from(pros), consumers: Array.from(consumers) };
  }, [threads, user?.id]);

  const { data: nameMap } = useQuery({
    queryKey: ["chat_thread_names", otherIds],
    enabled: (otherIds.pros.length + otherIds.consumers.length) > 0,
    queryFn: async () => {
      const m = new Map<string, { name: string; sub: string | null; avatar_path: string | null }>();
      if (otherIds.pros.length) {
        const { data } = await supabase
          .from("pro_profiles")
          .select("user_id, display_name, discipline, location, avatar_path")
          .in("user_id", otherIds.pros);
        for (const r of data ?? []) {
          m.set(r.user_id, {
            name: r.display_name ?? "Professional",
            sub: [r.discipline, r.location].filter(Boolean).join(" · ") || null,
            avatar_path: r.avatar_path ?? null,
          });
        }
      }
      if (otherIds.consumers.length) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, display_name, postcode")
          .in("user_id", otherIds.consumers);
        for (const r of data ?? []) {
          m.set(r.user_id, {
            name: r.display_name ?? "Client",
            sub: r.postcode ?? null,
            avatar_path: null,
          });
        }
      }
      return m;
    },
  });

  // Unread counts per thread — cheap enough for a modest inbox
  const { data: unreadMap } = useQuery({
    queryKey: ["chat_thread_unread", user?.id, threads?.map((t) => t.id)],
    enabled: !!user?.id && !!threads && threads.length > 0,
    queryFn: async () => {
      const ids = (threads ?? []).map((t) => t.id);
      const { data } = await supabase
        .from("chat_messages")
        .select("thread_id")
        .in("thread_id", ids)
        .neq("sender_id", user!.id)
        .is("read_at", null);
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.thread_id, (m.get(r.thread_id) ?? 0) + 1);
      return m;
    },
  });

  return (
    <ScreenLayout>
      <TitleBar title="Messages" onBack={() => nav(-1)} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Direct conversations open once an enquiry is accepted.
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
            const otherId = t.pro_user_id === user?.id ? t.consumer_id : t.pro_user_id;
            const other = nameMap?.get(otherId);
            const unread = unreadMap?.get(t.id) ?? 0;
            const last = t.last_message_at ?? t.created_at;
            return (
              <SurfaceCard
                key={t.id}
                onClick={() => nav(`/messages/${t.id}`)}
                className="cursor-pointer hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <ProAvatar
                    name={other?.name ?? "?"}
                    photoUrl={other?.avatar_path ?? undefined}
                    size="size-11"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-sm font-semibold leading-tight truncate flex-1">
                        {other?.name ?? "Conversation"}
                      </p>
                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    {other?.sub && (
                      <p className="text-[11px] text-muted-foreground truncate">{other.sub}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
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
