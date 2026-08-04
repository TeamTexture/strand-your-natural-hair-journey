// Derives the current role view ("consumer" | "pro" | "brand" | "admin")
// using the same rules as GlobalMenu: route-first, sessionStorage fallback.
// Used to scope chat data, notifications and unread counts to the view the
// user is currently inside — so a brand message doesn't badge the consumer
// view, an admin's brand thread doesn't appear in the admin panel, etc.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export type ActiveRoleView = "consumer" | "pro" | "admin" | "brand";

// Routes that exist inside every view (chat, notifications) — these must NOT
// change the remembered view, so a pro opening messages stays "pro" and a
// consumer opening messages stays "consumer".
const SHARED_PREFIXES = ["/messages", "/chat", "/notifications"];

export function routeToView(path: string, search = ""): ActiveRoleView | null {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/brand")) return "brand";
  if (path === "/pro" || path.startsWith("/pro/")) return "pro";
  if (path === "/" ) return null;
  if (SHARED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  // Professional dashboard links can open shared consumer-facing pages for a
  // pro-specific purpose. Keep those journeys labelled as Professional rather
  // than flipping the toggle/menu back to My STRAND.
  if (path === "/directory") {
    const params = new URLSearchParams(search);
    if (params.get("self") === "1") return "pro";
  }
  // Everything else in the app is a consumer-side route (nutrition plan,
  // journal, products, onboarding, profile…), so the toggle must read
  // "My STRAND" even for multi-role accounts.
  return "consumer";
}


export function useActiveRoleView(): ActiveRoleView {
  const { pathname, search } = useLocation();
  const routeView = routeToView(pathname, search);

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
    // Legacy self-referential rows (the same account on both sides) are
    // ambiguous — they belong to neither side of the wall, so hide them.
    if (t.consumer_id && t.consumer_id === t.pro_user_id) return false;
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
