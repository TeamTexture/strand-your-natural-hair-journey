import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import ScreenLayout from "@/components/ScreenLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearOnboardingDrafts } from "@/hooks/useOnboardingDraft";
import { stampProfileConfirmedOnOnboarding } from "@/lib/profileConfirmation";
import ActivatingMembership from "@/components/ActivatingMembership";
import { useMembershipActivation } from "@/hooks/useMembershipActivation";

// Where a new member lands once their membership is confirmed.
const LANDING = "/nutrition-plan";

const SuccessScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Ask Stripe for the truth rather than waiting on the webhook.
  const { state, hasAccess, retry } = useMembershipActivation(true);

  // Mark onboarding complete on the profile so the next login skips onboarding.
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", user.id);
    // Every question was answered explicitly in this flow, so the member is
    // confirmed by definition — no reconfirmation prompt for new members.
    void stampProfileConfirmedOnOnboarding(user.id);
  }, [user]);

  // Onboarding is finished — the step drafts are no longer needed.
  useEffect(() => {
    clearOnboardingDrafts();
  }, []);

  // Primary CTA — run the feature-highlight intro, then land on nutrition.
  // The anchored home tour flag stays set so it still fires the first time the
  // member opens Home.
  const handleContinue = () => {
    localStorage.removeItem("strand_home_tour_seen_v1");
    localStorage.removeItem("strand_home_tour_seen_v2");
    localStorage.removeItem("strand_home_tour_seen_v3");
    localStorage.setItem("strand_home_tour_pending", "1");
    navigate("/walkthrough", { replace: true, state: { returnTo: LANDING } });
  };

  const handleSkip = () => {
    localStorage.setItem("strand_walkthrough_complete", "true");
    localStorage.setItem("strand_home_tour_pending", "1");
    navigate(LANDING, { replace: true });
  };

  // Auto-forward only once access is actually confirmed — never blind.
  useEffect(() => {
    if (!hasAccess) return;
    const t = window.setTimeout(handleContinue, 2200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  if (state !== "active") {
    return <ActivatingMembership stuck={state === "stuck"} onRetry={retry} />;
  }

  return (
    <ScreenLayout>
      <div className="h-full flex flex-col px-7 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-6">🌿</div>
          <h1 className="font-display text-[26px] leading-tight text-foreground mb-4">
            Your Strand profile is ready.
          </h1>
          <p className="font-body text-base leading-snug text-muted-foreground max-w-[280px]">
            Every recommendation, alert, and insight is now built around your verified clinical data. This is hair care that actually knows you.
          </p>
        </div>
        <Button variant="gold" size="pill" onClick={handleContinue}>
          Enter Strand →
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          className="mt-3 font-body text-[13px] text-primary hover:underline underline-offset-4 self-center min-h-[44px] px-2"
        >
          Skip the intro
        </button>
      </div>
    </ScreenLayout>
  );
};

export default SuccessScreen;
