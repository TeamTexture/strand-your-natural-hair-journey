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
import { otherParticipantId, useChatThreadMeta, useChatThreads } from "@/hooks/useChat";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";

const Messages = () => {
  useEffect(() => { markPlusSurfaceSeen("messages"); }, []);
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: threads, isLoading } = useChatThreads();
  const view = useActiveRoleView();

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

  // STRAND Team threads: when I'm the admin side, the row should name the
  // member and their membership tier rather than saying "STRAND Team".
  const supportSubjects = useMemo(() => {
    if (!user?.id || !threads) return [] as string[];
    const out = new Set<string>();
    for (const t of threads) {
      if (t.thread_type !== "admin_support") continue;
      if (t.admin_user_id === user.id && t.subject_user_id) out.add(t.subject_user_id);
    }
    return Array.from(out);
  }, [threads, user?.id]);

  const { data: subjectMap } = useQuery({
    queryKey: ["chat_support_subjects", supportSubjects],
    enabled: supportSubjects.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [profRes, subRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", supportSubjects),
        supabase
          .from("consumer_subscriptions")
          .select("user_id, tier, status")
          .in("user_id", supportSubjects),
      ]);
      const tiers = new Map<string, string>();
      for (const s of subRes.data ?? []) {
        const active = s.status === "active" || s.status === "trialing";
        if (active) tiers.set(s.user_id, s.tier === "plus" ? "STRAND+ member" : "STRAND member");
      }
      const m = new Map<string, { name: string; membership: string; avatar_path: string | null }>();
      for (const p of profRes.data ?? []) {
        m.set(p.user_id, {
          name: p.display_name ?? "Member",
          membership: tiers.get(p.user_id) ?? "STRAND member",
          avatar_path: p.avatar_url ?? null,
        });
      }
      return m;
    },
  });


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

  // Last message + unread count per thread (shared cache with the widget).
  const { data: threadMeta } = useChatThreadMeta(threads);


  return (
    <ScreenLayout>
      <TitleBar title="Messages" />

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
            const isAdminSide = isSupport && t.admin_user_id === user?.id;
            const subject = isAdminSide && t.subject_user_id
              ? subjectMap?.get(t.subject_user_id)
              : null;
            const isProSide = t.thread_type === "client_pro" && t.pro_user_id === user?.id;
            const otherId = user?.id ? otherParticipantId(t, user.id) : null;
            const other = otherId ? nameMap?.get(otherId) : null;
            const meta = threadMeta?.get(t.id);
            const unread = meta?.unread ?? 0;
            const last = t.last_message_at ?? t.created_at;
            const displayName = isSupport
              ? subject
                ? `${subject.name} (${subject.membership})`
                : "STRAND Team"
              : (other?.name ?? "Conversation");
            const sub = isSupport
              ? (isAdminSide ? "STRAND Team conversation" : "Support & guidance")
              : isProSide
                ? null // pro-side: hide postcode; use relationship tag below
                : other?.sub ?? null;
            const tag = isProSide && otherId
              ? clientTagMap?.get(otherId)
              : undefined;
            // Who sent the most recent message, shown above the preview line.
            const senderLabel = !meta?.preview
              ? null
              : meta.preview_mine
                ? "You"
                : isSupport
                  ? (meta.preview_sender_role === "admin"
                      ? "STRAND Team"
                      : subject?.name ?? "STRAND Team")
                  : other?.name ?? "Them";
            const isOpen = expandedId === t.id;

            return (
              <SurfaceCard
                key={t.id}
                onClick={() => setExpandedId(isOpen ? null : t.id)}
                className={`cursor-pointer transition-colors ${isOpen ? "border-primary/50" : "hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-3">
                  {isSupport && !subject ? (
                    <div className="size-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <BadgeCheck className="size-5" />
                    </div>
                  ) : (
                    <ProAvatar
                      name={subject?.name ?? other?.name ?? "?"}
                      photoUrl={subject?.avatar_path ?? other?.avatar_path ?? undefined}
                      size="size-11"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-display text-sm font-semibold leading-tight truncate">
                        {displayName}
                      </p>
                      {isSupport && !subject && (
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
                      <div className="mt-1">
                        <p className="text-[10px] font-body font-semibold uppercase tracking-[0.1em] text-foreground/70 truncate">
                          {senderLabel}
                        </p>
                        <div className="flex items-center gap-1">
                          {meta.preview_mine && (
                            <DeliveryTicks readAt={meta.preview_read ? "read" : null} />
                          )}
                          <p className="text-[11.5px] text-muted-foreground truncate">
                            {meta.preview}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[10px] text-muted-foreground/80">
                        {formatDistanceToNow(new Date(last), { addSuffix: true })}
                      </p>
                      <span className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] font-body font-semibold text-primary">
                        {isOpen ? "Collapse" : "Preview"}
                        <ChevronDown
                          className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </span>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <InlineThreadChat
                    thread={t}
                    otherName={
                      isSupport
                        ? (subject?.name ?? "STRAND Team")
                        : other?.name ?? "them"
                    }
                  />
                )}
              </SurfaceCard>
            );
          })

        )}
      </div>
    </ScreenLayout>
  );
};

export default Messages;
