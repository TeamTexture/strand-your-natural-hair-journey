import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { purgeStrandUserScopedKeys } from "@/lib/strandLocalStorage";

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

  useEffect(() => {
    // 1. Subscribe BEFORE getSession (per Supabase guidance).
    //    Also purge user-scoped strand_* localStorage on SIGNED_OUT so a
    //    server-driven session expiry can't leak the previous user's clinical
    //    cache to the next account that signs in on this browser.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        purgeStrandUserScopedKeys();
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
    // Purge BEFORE the supabase call so even if the network signOut fails,
    // the next user on this device still gets a clean cache. The
    // SIGNED_OUT event handler above will run too, but is idempotent.
    purgeStrandUserScopedKeys();
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
