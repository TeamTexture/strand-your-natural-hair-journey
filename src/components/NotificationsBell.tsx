import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** Global notifications bell — appears in the TitleBar right slot. */
const NotificationsBell = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();

  if (!user) return null;

  const openItem = async (n: (typeof notifications)[number]) => {
    if (!n.read_at) await markRead(n.id);
    setOpen(false);
    if (n.url) nav(n.url);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative p-2 -mr-1 text-foreground/70 hover:text-primary transition-colors"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-alert-dark text-[9px] font-body font-bold text-white flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px] p-0 max-h-[420px] overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <p className="text-[11px] font-body font-bold uppercase tracking-wider text-foreground/70">
            Notifications
          </p>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[10.5px] font-body font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <CheckCheck className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-[12px] font-body text-foreground/55">
              You're all caught up.
            </p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/60 flex gap-2 hover:bg-primary/5 transition-colors ${
                      !n.read_at ? "bg-primary/[0.04]" : ""
                    }`}
                  >
                    <div className={`mt-1 size-2 rounded-full shrink-0 ${!n.read_at ? "bg-primary" : "bg-transparent"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-body font-semibold text-foreground leading-tight">
                        {n.title ?? "Notification"}
                      </p>
                      {n.body && (
                        <p className="text-[11.5px] font-body text-foreground/65 leading-snug line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] font-body text-foreground/45 mt-1">{timeAgo(n.created_at)} ago</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsBell;
