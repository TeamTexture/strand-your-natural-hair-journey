import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import RequireAuth from "@/components/RequireAuth";
import LoadingDot from "@/components/LoadingDot";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
}

/**
 * Post-onboarding lock.
 *
 * If the user has already finished onboarding (profiles.onboarding_completed_at
 * is set) but has no active membership / complimentary access / privileged role,
 * they are locked to /subscribe and cannot revisit onboarding, setup, or the
 * walkthrough. This prevents free navigation back through the flow after they
 * upload everything but skip payment.
 *
 * Users mid-onboarding (no onboarding_completed_at yet) pass through so they
 * can finish the flow — the paywall then catches them on the way into /home.
 */
const OnboardingGate = ({ children }: Props) => (
  <RequireAuth>
    <OnboardingGateInner>{children}</OnboardingGateInner>
  </RequireAuth>
);

const OnboardingGateInner = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { hasAccess, isLoading: subLoading } = useConsumerSubscription();

  const { data: completed, isLoading: profileLoading } = useQuery({
    queryKey: ["profile_onboarding_completed", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!(data as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at;
    },
  });

  if (subLoading || profileLoading) return <LoadingDot />;
  if (completed && !hasAccess) {
    return <Navigate to="/subscribe" replace />;
  }
  return <>{children}</>;
};

export default OnboardingGate;
