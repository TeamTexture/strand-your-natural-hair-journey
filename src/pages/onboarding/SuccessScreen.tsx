import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import { Button } from "@/components/ui/button";

const SuccessScreen = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <div className="h-full flex flex-col px-7 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-6">🌿</div>
          <h1 className="font-display text-[26px] leading-tight text-foreground mb-4">
            Your Strand profile is ready.
          </h1>
          <p className="font-script italic text-base leading-snug text-muted-foreground max-w-[280px]">
            Every recommendation, alert, and insight is now built around your verified clinical data. This is hair care that actually knows you.
          </p>
        </div>
        <Button variant="gold" size="pill" onClick={() => navigate("/home")}>
          Enter Strand →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default SuccessScreen;
