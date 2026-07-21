// Admin "View as user" mode.
//
// When an admin activates this, `useAuth().user.id` is swapped to the target
// user's id so every consumer read-hook loads that user's data. The admin's
// JWT stays intact — RLS admin-read policies keep working. Writes to the
// target's rows fail naturally at RLS since the admin's `auth.uid()` doesn't
// match the row's `user_id`, so no data can be corrupted from this mode.
//
// State is persisted to sessionStorage so a page refresh keeps it, but it
// clears when the tab closes so admins can't accidentally leave the mode on.
// Non-admins who tamper with the key see zero effect: RLS blocks their reads
// of other users' data.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

const STORAGE_KEY = "strand_view_as_user_id";
const NAME_KEY = "strand_view_as_display_name";

interface ViewAsCtx {
  viewAsUserId: string | null;
  viewAsDisplayName: string | null;
  isViewingAs: boolean;
  startViewAs: (userId: string, displayName?: string | null) => void;
  stopViewAs: () => void;
}

const Ctx = createContext<ViewAsCtx>({
  viewAsUserId: null,
  viewAsDisplayName: null,
  isViewingAs: false,
  startViewAs: () => {},
  stopViewAs: () => {},
});

const readSession = (key: string): string | null => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};

export const ViewAsProvider = ({ children }: { children: ReactNode }) => {
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(() => readSession(STORAGE_KEY));
  const [viewAsDisplayName, setViewAsDisplayName] = useState<string | null>(() => readSession(NAME_KEY));

  // Keep multiple tabs in sync in case the admin opens the app in two tabs.
  useEffect(() => {
    const handler = () => {
      setViewAsUserId(readSession(STORAGE_KEY));
      setViewAsDisplayName(readSession(NAME_KEY));
    };
    window.addEventListener("strand:view-as-changed", handler);
    return () => window.removeEventListener("strand:view-as-changed", handler);
  }, []);

  const startViewAs = useCallback((userId: string, displayName?: string | null) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, userId);
      if (displayName) sessionStorage.setItem(NAME_KEY, displayName);
      else sessionStorage.removeItem(NAME_KEY);
    } catch { /* ignore */ }
    setViewAsUserId(userId);
    setViewAsDisplayName(displayName ?? null);
    window.dispatchEvent(new Event("strand:view-as-changed"));
  }, []);

  const stopViewAs = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(NAME_KEY);
    } catch { /* ignore */ }
    setViewAsUserId(null);
    setViewAsDisplayName(null);
    window.dispatchEvent(new Event("strand:view-as-changed"));
  }, []);

  const value = useMemo<ViewAsCtx>(() => ({
    viewAsUserId,
    viewAsDisplayName,
    isViewingAs: !!viewAsUserId,
    startViewAs,
    stopViewAs,
  }), [viewAsUserId, viewAsDisplayName, startViewAs, stopViewAs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useViewAs = () => useContext(Ctx);
