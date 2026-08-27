// MEMBER MESSAGES — the admin inbox for member-initiated "Speak to STRAND"
// conversations. Admin read/write access is gated by has_role(auth.uid(),
// 'admin') in RLS, the same admin check used across this project.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { MessageSquareHeart, User2 } from "lucide-react";
import { smartBack } from "@/lib/smartBack";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import InlineThreadChat from "@/components/chat/InlineThreadChat";
import { useAdminSupportThreads } from "@/hooks/useSupportChat";

const AdminMemberMessages = () => {
  const nav = useNavigate();
  const { data: rows, isLoading } = useAdminSupportThreads();
  const [openId, setOpenId] = useState<string | null>(null);

  const totalUnread = useMemo(
    () => (rows ?? []).reduce((n, r) => n + r.unread, 0),
    [rows],
  );

  return (
    <ScreenLayout>
      <TitleBar title="Member messages" onBack={smartBack(nav, "/admin")} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Questions and issues members sent from their dashboard. They see you as
          "STRAND Team".
          {totalUnread > 0 && (
            <span className="text-primary font-semibold">
              {" "}
              {totalUnread} unread message{totalUnread === 1 ? "" : "s"}.
            </span>
          )}
        </p>
      </div>

      <div className="px-5 pb-10 space-y-2.5">
        {isLoading ? (
          <LoadingDot label="Loading conversations…" fullScreen={false} />
        ) : (rows ?? []).length === 0 ? (
          <EmptyState
            icon="💬"
            message="No member messages yet"
            hint="They start here when a member taps Speak to STRAND on their dashboard."
          />
        ) : (
          (rows ?? []).map((r) => {
            const isOpen = openId === r.thread.id;
            return (
              <SurfaceCard
                key={r.thread.id}
                className={
                  r.unread > 0
                    ? "border-2 border-primary/60 bg-primary/[0.06]"
                    : "hover:border-primary/40"
                }
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : r.thread.id)}
                  className="w-full text-left flex items-center gap-3"
                >
                  <span className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <User2 className="size-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-display text-sm font-semibold leading-tight truncate flex-1">
                        {r.name}
                      </p>
                      {r.unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
                          {r.unread > 99 ? "99+" : r.unread}
                        </span>
                      )}
                    </div>
                    {r.email && (
                      <p className="text-[10.5px] text-muted-foreground font-body truncate">
                        {r.email}
                      </p>
                    )}
                    <p className="text-[11.5px] text-foreground/80 font-body truncate mt-0.5">
                      {r.preview}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(r.lastAt), { addSuffix: true })}
                    </p>
                  </div>
                </button>

                {isOpen && <InlineThreadChat thread={r.thread} otherName={r.name} />}
              </SurfaceCard>
            );
          })
        )}
      </div>

      <div className="px-5 pb-10">
        <button
          type="button"
          onClick={() => nav("/admin/messages")}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-body font-semibold text-primary hover:underline"
        >
          <MessageSquareHeart className="size-3.5" /> STRAND Team messages (pros, brands,
          contact enquiries)
        </button>
      </div>
    </ScreenLayout>
  );
};

export default AdminMemberMessages;
