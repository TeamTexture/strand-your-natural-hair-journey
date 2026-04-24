import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ProGate = () => {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<"yes" | "no">("yes");

  return (
    <ScreenLayout>
      <TitleBar title="Your Hair Analysis" right={<span>3 of 9</span>} />
      <ProgressDots total={9} current={3} />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="text-center py-6">
          <div className="text-4xl mb-3">🛡️</div>
          <h2 className="font-display text-[22px] leading-tight mb-3">
            Your hair characteristics need to come from a professional.
          </h2>
          <p className="font-body text-[15px] leading-snug text-muted-foreground">
            Self-diagnosing porosity, elasticity and density is one of the biggest sources of misinformation in the natural hair community. A trichologist or dermatologist will assess your hair accurately — and that accuracy is what makes every Strand recommendation genuinely useful.
          </p>
        </SurfaceCard>

        <p className="text-sm font-medium font-body text-foreground pt-2">
          Have you had a professional hair consultation in the last 3 months?
        </p>

        <button
          type="button"
          onClick={() => setChoice("yes")}
          className={cn(
            "w-full text-left p-4 rounded-[14px] border bg-card transition-colors",
            choice === "yes" ? "border-primary border-2" : "border-border",
          )}
        >
          <p className="text-sm font-medium font-body">Yes — within the last 3 months</p>
          <p className="text-xs text-muted-foreground mt-1">
            You can enter their details and your characteristics now
          </p>
        </button>

        <button
          type="button"
          onClick={() => setChoice("no")}
          className={cn(
            "w-full text-left p-4 rounded-[14px] border bg-card transition-colors",
            choice === "no" ? "border-primary border-2" : "border-border",
          )}
        >
          <p className="text-sm font-medium font-body">No — it has been longer or I have not been</p>
          <p className="text-xs text-muted-foreground mt-1">
            We will help you book one or find a professional near you
          </p>
        </button>

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => navigate(choice === "yes" ? "/onboarding/pro-details" : "/onboarding/pro-book")}
        >
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProGate;
