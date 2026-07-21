import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { purgeStrandUserScopedKeys } from "@/lib/strandLocalStorage";
import { logUserSession } from "@/lib/sessionTracker";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const previousSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (previousSessionRef.current && !session) {
      purgeStrandUserScopedKeys("session-null-effect");
    }
    previousSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    // 1. Subscribe BEFORE getSession (per Supabase guidance).
    //    Also purge user-scoped strand_* localStorage on SIGNED_OUT so a
    //    server-driven session expiry can't leak the previous user's clinical
    //    cache to the next account that signs in on this browser.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        purgeStrandUserScopedKeys("SIGNED_OUT-event");
      }
    });
    // 2. Then load existing session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Remember first name for the returning-user welcome on the splash screen.
    const displayName = session?.user?.user_metadata?.display_name as string | undefined;
    if (displayName) {
      const firstName = displayName.trim().split(/\s+/)[0];
      if (firstName) {
        try { localStorage.setItem("strand_last_display_name", firstName); } catch {}
      }
    }
    // Purge BEFORE the supabase call so even if the network signOut fails,
    // the next user on this device still gets a clean cache. The
    // SIGNED_OUT event handler above will run too, but is idempotent.
    purgeStrandUserScopedKeys("signOut-handler");
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
