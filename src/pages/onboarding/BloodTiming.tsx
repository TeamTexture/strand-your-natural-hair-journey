import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stethoscope, Upload } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import LolaPeakInsightsCard from "@/components/blood/LolaPeakInsightsCard";
import OptionalBadge from "@/components/blood/OptionalBadge";
import BloodWorkSkippedCard from "@/components/blood/BloodWorkSkippedCard";
import { useBloodSkipped } from "@/lib/bloodSkip";
import { Button } from "@/components/ui/button";
import { useMembershipExit } from "@/hooks/useMembershipExit";
import { cn } from "@/lib/utils";

const BloodTiming = () => {
  const navigate = useNavigate();
  const { resolveMembershipPath } = useMembershipExit();
  // No default — this question must be answered, not assumed.
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const [continuing, setContinuing] = useState(false);
  const { skipped, skip, unskip } = useBloodSkipped();

  // Blood work is optional, so skipping must go somewhere sensible rather than
  // dead-ending. The shared decision layer answers where she belongs next, and
  // everything already entered stays saved.
  const continueWithout = async () => {
    setContinuing(true);
    try {
      navigate(await resolveMembershipPath(), { replace: true });
    } finally {
      setContinuing(false);
    }
  };

  // "I'll decide later" — the same reversible decision as on the resume screen,
  // saved durably so the card is greyed out on every device until she comes back.
  const skipForNow = async () => {
    setContinuing(true);
    try {
      await skip();
      navigate(await resolveMembershipPath(), { replace: true });
    } finally {
      setContinuing(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Blood Test" onBack={onboardingBack(navigate, "/onboarding/blood-timing")} />
      <OnboardingGuide className="pt-2 pb-1" />

      <div className="px-5 pb-8 space-y-4">
        <h2 className="font-display text-[22px] leading-tight text-center pt-2">
          Have you had a blood test in the last 6 months?
        </h2>
        <ItalicSub>
          Your iron, ferritin, vitamin D, B12 and thyroid values are what the diet and
          nutrition side of STRAND reads.
        </ItalicSub>

        {skipped ? (
          <BloodWorkSkippedCard onAdd={() => { void unskip(); setChoice("yes"); }} />
        ) : (
          <SurfaceCard tone="gold">
            <OptionalBadge />
            <p className="font-display text-base font-semibold mt-2">Blood work</p>
            <p className="text-sm font-body leading-snug mt-1">
              You don't need this to use STRAND. It only opens the diet and nutrition
              section — everything else works without it.
            </p>
            <p className="text-sm font-body leading-snug mt-2">
              Add your results whenever you're ready.
            </p>
          </SurfaceCard>
        )}

        <div className="space-y-3">
          {(["yes", "no"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setChoice(v)}
              className={cn(
                "w-full text-left p-4 rounded-[14px] border bg-card transition-colors",
                choice === v ? "border-primary border-2" : "border-border",
              )}
            >
              <p className="text-sm font-medium font-body">
                {v === "yes"
                  ? "Yes — within the last 6 months"
                  : "No — it's older than 6 months or I've never tested"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {v === "yes"
                  ? "You'll upload or enter your results next"
                  : "Carry on without them, or see where to get tested"}
              </p>
            </button>
          ))}
        </div>

        {!choice && (
          <p className="text-[12px] font-body text-muted-foreground text-center leading-snug">
            Choose one of the two answers above, or leave it for now.
          </p>
        )}

        {!skipped && (
          <Button
            variant="outline"
            size="pill"
            className="w-full whitespace-normal break-words leading-tight"
            disabled={continuing}
            onClick={() => void skipForNow()}
          >
            Skip — I'll decide later
          </Button>
        )}

        {choice === "no" ? (
          <>
            <SurfaceCard>
              <p className="text-sm font-body leading-snug">
                You can carry on without blood work. The diet and nutrition section stays
                closed until you add results, and everything else is unaffected.
              </p>
            </SurfaceCard>

            <Button
              variant="gold"
              size="pill"
              className="w-full whitespace-normal break-words leading-tight"
              disabled={continuing}
              onClick={() => void continueWithout()}
            >
              {continuing ? "Saving…" : "Continue without bloods for now →"}
            </Button>

            <Button
              variant="outline"
              size="pill"
              className="w-full whitespace-normal break-words leading-tight"
              onClick={() => navigate("/directory?bloodOnly=1")}
            >
              <Stethoscope className="size-4 mr-1.5" />
              See verified doctors →
            </Button>

            <LolaPeakInsightsCard />

            <p className="text-[12px] font-body text-muted-foreground text-center leading-snug">
              Nothing you've entered expires. Add your results any time from your
              nutrition plan or your profile.
            </p>
          </>
        ) : choice === "yes" ? (
          <div className="space-y-3 mt-4">
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => navigate("/blood-upload?onboarding=1")}
            >
              <Upload className="size-4 mr-1.5" />
              Upload my tests
            </Button>
            <Button
              variant="outline"
              size="pill"
              className="w-full whitespace-normal break-words leading-tight"
              disabled={continuing}
              onClick={() => void continueWithout()}
            >
              I'll add them later →
            </Button>
          </div>
        ) : null}
      </div>
    </ScreenLayout>
  );
};

export default BloodTiming;
