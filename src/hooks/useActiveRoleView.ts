// Derives the current role view ("consumer" | "pro" | "brand" | "admin")
// using the same rules as GlobalMenu: route-first, sessionStorage fallback.
// Used to scope chat data, notifications and unread counts to the view the
// user is currently inside — so a brand message doesn't badge the consumer
// view, an admin's brand thread doesn't appear in the admin panel, etc.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export type ActiveRoleView = "consumer" | "pro" | "admin" | "brand";

function routeToView(path: string): ActiveRoleView | null {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/brand")) return "brand";
  if (path === "/pro" || path.startsWith("/pro/")) return "pro";
  if (path === "/home" || path.startsWith("/home/")) return "consumer";
  return null;
}

export function useActiveRoleView(): ActiveRoleView {
  const { pathname } = useLocation();
  const routeView = routeToView(pathname);

  const [remembered, setRemembered] = useState<ActiveRoleView>(() => {
    try {
      const s = sessionStorage.getItem("strand.lastRoleView");
      if (s === "consumer" || s === "pro" || s === "admin" || s === "brand") return s;
    } catch { /* ignore */ }
    return "consumer";
  });

  useEffect(() => {
    if (routeView) {
      try { sessionStorage.setItem("strand.lastRoleView", routeView); } catch { /* ignore */ }
      setRemembered(routeView);
    }
  }, [routeView]);

  return routeView ?? remembered;
}

/** Predicate: does this chat thread belong to the given role view for uid? */
export function threadMatchesView(
  t: {
    thread_type: string;
    consumer_id: string | null;
    pro_user_id: string | null;
    admin_user_id: string | null;
    subject_user_id: string | null;
    subject_role: string | null;
  },
  uid: string,
  view: ActiveRoleView,
): boolean {
  if (t.thread_type === "client_pro") {
    if (view === "consumer") return t.consumer_id === uid;
    if (view === "pro") return t.pro_user_id === uid;
    return false; // client_pro threads never belong to admin/brand views
  }
  if (t.thread_type === "admin_support") {
    if (view === "admin") return t.admin_user_id === uid;
    // Subject-side: match by role tag (fallback to 'consumer' for legacy rows)
    if (t.subject_user_id !== uid) return false;
    const role = (t.subject_role ?? "consumer").toLowerCase();
    if (view === "consumer") return role === "consumer";
    if (view === "pro") return role === "pro";
    if (view === "brand") return role === "brand";
  }
  return false;
}
