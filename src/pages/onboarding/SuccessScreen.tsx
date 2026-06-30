import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import ScreenLayout from "@/components/ScreenLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  }, [user]);

  // Decide where to send the user when they tap Enter Strand
  const handleContinue = () => {
    const seen = localStorage.getItem("strand_walkthrough_complete") === "true";
    navigate(seen ? "/home" : "/walkthrough", { replace: true });
  };

  // Auto-route forward after a moment so the success screen still feels celebratory
  useEffect(() => {
    const t = window.setTimeout(handleContinue, 2200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      </div>
    </ScreenLayout>
  );
};

export default SuccessScreen;
