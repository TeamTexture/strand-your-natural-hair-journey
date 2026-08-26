import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import ScreenLayout from "@/components/ScreenLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearOnboardingDrafts } from "@/hooks/useOnboardingDraft";
import { stampProfileConfirmedOnOnboarding } from "@/lib/profileConfirmation";
import HairStrandIcon from "@/components/HairStrandIcon";
import { requestTourAutostart } from "@/lib/firstRunTour";

const SuccessScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

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

  const handleEnter = () => {
    requestTourAutostart();
    navigate("/home", { replace: true });
  }

  return (
    <ScreenLayout>
      <div className="h-full flex flex-col px-7 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <HairStrandIcon className="h-16 w-auto text-primary mb-6" />
          <p className="font-body text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Your profile is ready
          </p>
          <h1 className="font-display text-[32px] leading-tight text-foreground mb-4">
            Welcome to STRAND
          </h1>
          <p className="font-body text-base leading-snug text-muted-foreground max-w-[280px]">
            Your personal hair journal is ready. Take a quick tour to see where everything lives.
          </p>
        </div>
        <Button variant="gold" size="pill" onClick={handleEnter}>
          Enter STRAND →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default SuccessScreen;
