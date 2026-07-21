import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { purgeStrandUserScopedKeys } from "@/lib/strandLocalStorage";
import { logUserSession } from "@/lib/sessionTracker";
import { useViewAs } from "@/hooks/useViewAs";

interface AuthCtx {
  session: Session | null;
  /** The user object the app should render for.
   *  When the admin is in "View as user" mode this is a SHIM whose `id`
   *  points at the target user so every read-hook loads their data. Writes
   *  still originate from the admin's real JWT, so RLS blocks accidental
   *  edits to another user's rows. */
  user: User | null;
  /** Always the real signed-in user, regardless of view-as state. Use this
   *  for role/subscription checks and any code that must reflect the
   *  actually-signed-in identity (e.g. Stripe billing screens). */
  actualUser: User | null;
  /** Convenience alias — equal to `user?.id` (view-as target when active). */
  effectiveUserId: string | null;
  /** True when the admin has swapped into another user's data view. */
  isViewingAs: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  actualUser: null,
  effectiveUserId: null,
  isViewingAs: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const previousSessionRef = useRef<Session | null>(null);
  const { viewAsUserId, isViewingAs, stopViewAs } = useViewAs();

  useEffect(() => {
    if (previousSessionRef.current && !session) {
      purgeStrandUserScopedKeys("session-null-effect");
      // Sign-out must also end any active view-as; the target user's data
      // must never bleed into whoever signs in on this browser next.
      if (isViewingAs) stopViewAs();
    }
    previousSessionRef.current = session;
  }, [session, isViewingAs, stopViewAs]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        purgeStrandUserScopedKeys("SIGNED_OUT-event");
      }
      if (event === "SIGNED_IN" && s?.user?.id) {
        logUserSession(s.user.id, "auth-change");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user?.id) {
        logUserSession(data.session.user.id, "app-open");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const displayName = session?.user?.user_metadata?.display_name as string | undefined;
    if (displayName) {
      const firstName = displayName.trim().split(/\s+/)[0];
      if (firstName) {
        try { localStorage.setItem("strand_last_display_name", firstName); } catch { /* noop */ }
      }
    }
    purgeStrandUserScopedKeys("signOut-handler");
    if (isViewingAs) stopViewAs();
    await supabase.auth.signOut();
  };

  const actualUser = session?.user ?? null;

  // Build the effective user object. When view-as is active AND we have a
  // real admin session, swap the id (leaving other fields intact — profile
  // data on screen is loaded via `profiles` queries scoped to this id anyway).
  const user = useMemo<User | null>(() => {
    if (!actualUser) return null;
    if (!viewAsUserId || viewAsUserId === actualUser.id) return actualUser;
    return { ...actualUser, id: viewAsUserId } as User;
  }, [actualUser, viewAsUserId]);

  const value: AuthCtx = {
    session,
    user,
    actualUser,
    effectiveUserId: user?.id ?? null,
    isViewingAs: isViewingAs && !!actualUser && viewAsUserId !== actualUser?.id,
    loading,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
