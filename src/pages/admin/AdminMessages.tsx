import { smartBack } from "@/lib/smartBack";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BadgeCheck, MessageSquarePlus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatThreads } from "@/hooks/useChat";

const AdminMessages = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: threads, isLoading } = useChatThreads();

  const support = useMemo(
    () => (threads ?? []).filter((t) => t.thread_type === "admin_support" && t.admin_user_id === user?.id),
    [threads, user?.id],
  );

  const subjectIds = Array.from(new Set(support.map((t) => t.subject_user_id).filter((v): v is string => !!v)));
  const { data: names } = useQuery({
    queryKey: ["admin-messages-names", subjectIds.sort().join(",")],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, string>();
      const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", subjectIds);
      (data ?? []).forEach((r) => map.set(r.user_id, r.display_name ?? "Member"));
      return map;
    },
  });

  const { data: unreadMap } = useQuery({
    queryKey: ["admin-messages-unread", support.map((t) => t.id)],
    enabled: support.length > 0 && !!user?.id,
    queryFn: async () => {
      const ids = support.map((t) => t.id);
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
      <TitleBar title="STRAND Team messages" onBack={smartBack(nav, "/admin")} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Chat directly with any member, professional or brand. They see this as "STRAND Team".
        </p>
      </div>

      <div className="px-5 pb-3 flex gap-2">
        <Button variant="outline" size="pill" onClick={() => nav("/admin/members")} className="flex-1">
          <MessageSquarePlus className="size-4 mr-1.5" /> Members
        </Button>
        <Button variant="outline" size="pill" onClick={() => nav("/admin/professionals")} className="flex-1">
          <MessageSquarePlus className="size-4 mr-1.5" /> Pros
        </Button>
        <Button variant="outline" size="pill" onClick={() => nav("/admin/brands")} className="flex-1">
          <MessageSquarePlus className="size-4 mr-1.5" /> Brands
        </Button>
      </div>

      <div className="px-5 pb-8 space-y-2.5">
        {isLoading ? (
          <LoadingDot label="Loading…" fullScreen={false} />
        ) : support.length === 0 ? (
          <EmptyState icon="💬" message="No support threads yet" hint="Start one from a member, pro or brand card." />
        ) : (
          support.map((t) => {
            const name = t.subject_user_id ? names?.get(t.subject_user_id) ?? "Member" : "Member";
            const unread = unreadMap?.get(t.id) ?? 0;
            const last = t.last_message_at ?? t.created_at;
            return (
              <SurfaceCard
                key={t.id}
                onClick={() => nav(`/messages/${t.id}`)}
                className="cursor-pointer hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <BadgeCheck className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-display text-sm font-semibold leading-tight truncate flex-1">{name}</p>
                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
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

export default AdminMessages;
