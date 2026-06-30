import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import SplashScreen from "@/components/SplashScreen";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const { user, loading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Once we have a user, check onboarding status so returning users
  // skip both the splash AND the onboarding flow.
  useEffect(() => {
    if (loading || !user) return;
    setChecking(true);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setTarget(data?.onboarding_completed_at ? "/home" : "/onboarding/profile-step-1");
      setChecking(false);
    })();
  }, [loading, user]);

  if (loading || (user && checking)) return <LoadingDot />;
  if (user && target) return <Navigate to={target} replace />;

  return (
    <>
      <title>STRAND — Hair Journal for TT Collective Pro</title>
      <meta
        name="description"
        content="STRAND: a hair journal and clinical companion for women on a natural hair care journey. Exclusive to TT Collective Pro members."
      />
      <SplashScreen />
    </>
  );
};

export default Index;
