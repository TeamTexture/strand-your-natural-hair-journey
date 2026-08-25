import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { purgeStrandUserScopedKeys, STRAND_OWNER_KEY } from "@/lib/strandLocalStorage";
import { logUserSession } from "@/lib/sessionTracker";
import { useViewAs } from "@/hooks/useViewAs";
import { clearOnboardingResolved } from "@/lib/onboardingResolved";
import { beginRecoveryLock, clearRecoveryLock } from "@/lib/recoveryLock";

const AUTH_RESTORE_TIMEOUT_MS = 4500;

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
    // Losing a session is NOT proof of a sign-out. Expired/failed refreshes and
    // background tab churn both land here, and purging on those wiped members'
    // in-progress onboarding state. Only end view-as; never delete data.
    if (previousSessionRef.current && !session && isViewingAs) stopViewAs();
    previousSessionRef.current = session;
  }, [session, isViewingAs, stopViewAs]);

  useEffect(() => {
    let mounted = true;
    let authResolved = false;
    const finishAuthRestore = () => {
      if (!mounted || authResolved) return;
      authResolved = true;
      setLoading(false);
    };
    const restoreTimeout = window.setTimeout(() => {
      // The browser preview auth broker or a stale refresh can leave getSession()
      // pending indefinitely. Never let that strand the whole app on Loading:
      // auth events can still set the session later, and signed-out users can
      // always reach the splash screen.
      finishAuthRestore();
    }, AUTH_RESTORE_TIMEOUT_MS);

    /** Purge only when a genuinely different member signs in on this device. */
    const guardDeviceOwner = (userId: string) => {
      try {
        const previous = localStorage.getItem(STRAND_OWNER_KEY);
        if (previous && previous !== userId) {
          purgeStrandUserScopedKeys("device-owner-change");
        }
        localStorage.setItem(STRAND_OWNER_KEY, userId);
      } catch {
        /* private mode / quota — nothing to guard */
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      finishAuthRestore();
      // A recovery link signs the user in before they've proven a password.
      // Lock the browser to the reset screen until the new password is saved.
      if (event === "PASSWORD_RECOVERY") {
        beginRecoveryLock(window.location.pathname.startsWith("/pro") ? "pro" : "member");
      }
      if (event === "SIGNED_OUT") {
        // Supabase also emits SIGNED_OUT for a failed token refresh, so this
        // must stay non-destructive. The explicit signOut() handler below is
        // the only place a member-initiated purge happens.
        clearRecoveryLock();
      }
      if (s?.user?.id) guardDeviceOwner(s.user.id);
      if (event === "SIGNED_IN" && s?.user?.id) {
        logUserSession(s.user.id, "auth-change");
      }
    });
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user?.id) {
          guardDeviceOwner(data.session.user.id);
          logUserSession(data.session.user.id, "app-open");
        }
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        // A failed session restore must never leave the app as a blank,
        // permanent loading screen. The signed-out screen remains usable and
        // the member can sign in again without losing their saved answers.
        console.error("[auth] session restore failed", error);
        setSession(null);
      })
      .finally(finishAuthRestore);
    return () => {
      mounted = false;
      window.clearTimeout(restoreTimeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Deliberately no "last display name" cache: a signed-out device must
    // never reference a specific identity (shared/borrowed device privacy).
    purgeStrandUserScopedKeys("signOut-handler");
    // Drop the "onboarding already complete" session memo so it can never leak
    // into the next account signed in on this device.
    clearOnboardingResolved();
    clearRecoveryLock();
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
