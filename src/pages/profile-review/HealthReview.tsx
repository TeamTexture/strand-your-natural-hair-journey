import { smartBack } from "@/lib/smartBack";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LevelGate from "@/components/tips/LevelGate";
import HealthFieldsSection from "@/components/profile-review/HealthFieldsSection";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { markSectionConfirmed } from "@/lib/profileConfirmation";

const HealthReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [finishing, setFinishing] = useState(false);
  const confirming = params.get("confirm") === "1";

  const confirmAndContinue = async () => {
    if (!user) return;
    setFinishing(true);
    try {
      await markSectionConfirmed(user.id, "health");
      navigate("/profile/colour?confirm=1");
    } catch {
      toast.error("Could not save your confirmation. Please try again.");
    } finally {
      setFinishing(false);
    }
  };
  return (
    <ScreenLayout>
      <TitleBar title="Health profile" onBack={smartBack(navigate, "/profile")} />
      <div className="px-5 pb-8 space-y-3">
        <LevelGate min={2}>
          <p className="text-[13px] text-muted-foreground leading-snug pb-1">
          Tap the pencil to update just one field at a time.
        </p>
        </LevelGate>
        <HealthFieldsSection />
        {confirming && (
          <Button variant="gold" size="pill" className="w-full" onClick={confirmAndContinue} disabled={finishing}>
            {finishing ? "Saving…" : "Confirm health & continue"}
          </Button>
        )}
      </div>
    </ScreenLayout>
  );
};

export default HealthReview;
