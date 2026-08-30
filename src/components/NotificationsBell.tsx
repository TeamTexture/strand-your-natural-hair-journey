import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  CheckCheck,
  ClipboardCheck,
  Megaphone,
  MessageSquare,
  ShieldAlert,
  Store,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { isChromeFreeRoute } from "@/lib/chromeFreeRoutes";
import { useNotifications } from "@/hooks/useNotifications";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { condenseProse } from "@/lib/tipsRender";
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

const ADMIN_ICONS: Record<string, typeof Bell> = {
  pro_application: ClipboardCheck,
  pro_profile_review: BadgeCheck,
  brand_profile: Store,
  brand_offer: Megaphone,
  brand_offer_revision: Megaphone,
  forum_report: ShieldAlert,
  contact_message: MessageSquare,
};

type Item = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
  admin: boolean;
  type?: string;
};

/** Global notifications bell — appears in the TitleBar right slot. */
const NotificationsBell = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAllRead, markRead, markManyRead } = useNotifications();
  const admin = useAdminNotifications();
  const { level } = useTipsLevel();

  // Mark-on-view: opening the panel marks everything currently visible read,
  // so the badge is gone once the user has seen the list. Runs shortly after
  // open so the unread highlight is still perceptible.
  const markingRef = useRef(false);
  useEffect(() => {
    if (!open) {
      markingRef.current = false;
      return;
    }
    const userIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    const adminIds = admin.notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (userIds.length === 0 && adminIds.length === 0) return;
    if (markingRef.current) return;
    markingRef.current = true;
    const t = window.setTimeout(() => {
      void Promise.all([
        userIds.length ? markManyRead(userIds) : Promise.resolve(),
        adminIds.length ? admin.markManyRead(adminIds) : Promise.resolve(),
      ]);
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notifications, admin.notifications]);

  // Second line of defence: never render on an onboarding / pre-paywall route,
  // whatever the caller does. See src/lib/chromeFreeRoutes.ts.
  if (!user || isChromeFreeRoute(location.pathname)) return null;


  const items: Item[] = [
    ...admin.notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      url: n.url,
      created_at: n.created_at,
      read_at: n.read_at,
      admin: true,
      type: n.type,
    })),
    ...notifications.map((n) => ({
      id: n.id,
      title: n.title ?? "Notification",
      body: n.body,
      url: n.url,
      created_at: n.created_at,
      read_at: n.read_at,
      admin: false,
    })),
  ].sort((a, b) => new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf());

  const totalUnread = unreadCount + admin.unreadCount;

  const openItem = async (n: Item) => {
    if (!n.read_at) await (n.admin ? admin.markRead(n.id) : markRead(n.id));
    setOpen(false);
    if (n.url) nav(n.url);
  };

  const markEverythingRead = async () => {
    await Promise.all([
      unreadCount > 0 ? markAllRead() : Promise.resolve(),
      admin.unreadCount > 0 ? admin.markAllRead() : Promise.resolve(),
    ]);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative p-2 -mr-1 text-foreground/70 hover:text-primary transition-colors"
        >
          <Bell className="size-5" />
          {totalUnread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-alert-dark text-[9px] font-body font-bold text-white flex items-center justify-center">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px] p-0 max-h-[420px] overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <p className="text-[11px] font-body font-bold uppercase tracking-wider text-foreground/70">
            Notifications
          </p>
          {totalUnread > 0 && (
            <button
              onClick={markEverythingRead}
              className="text-[10.5px] font-body font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <CheckCheck className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <p className="p-6 text-center text-[12px] font-body text-foreground/55">
              You're all caught up.
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = n.admin ? (ADMIN_ICONS[n.type ?? ""] ?? Bell) : null;
                return (
                  <li key={`${n.admin ? "a" : "u"}-${n.id}`}>
                    <button
                      onClick={() => openItem(n)}
                      className={`w-full text-left px-3 py-2.5 border-b border-border/60 flex gap-2 hover:bg-primary/5 transition-colors ${
                        !n.read_at ? "bg-primary/[0.04]" : "opacity-60"
                      }`}
                    >
                      {Icon ? (
                        <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      ) : (
                        <div
                          className={`mt-1 size-2 rounded-full shrink-0 ${!n.read_at ? "bg-primary" : "bg-transparent"}`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-body font-semibold text-foreground leading-tight break-words">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-[11.5px] font-body text-foreground/65 leading-snug mt-0.5 break-words">
                            {n.admin ? n.body : condenseProse(n.body, level)}
                          </p>
                        )}
                        <p className="text-[10px] font-body text-foreground/45 mt-1">
                          {timeAgo(n.created_at)} ago
                        </p>
                      </div>
                      {!n.read_at && Icon && (
                        <div className="mt-1 size-2 rounded-full shrink-0 bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsBell;
