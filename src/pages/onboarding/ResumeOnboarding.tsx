import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, Scissors, Stethoscope } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { getBloodDraftStep, hydrateBloodDraft } from "@/hooks/useBloodValues";

/**
 * Pick-up-where-you-left-off screen.
 *
 * Hair characteristics and blood work are both required, but neither has to be
 * finished in one sitting — blood work in particular means going away to
 * actually get tested. A returning member with either section outstanding lands
 * here and chooses which one to carry on with; both complete and this screen
 * never shows (the member goes straight to Home).
 */
const ResumeOnboarding = () => {
  const navigate = useNavigate();
  const { data: status, isLoading } = useOnboardingStatus();
  const [bloodResume, setBloodResume] = useState<string | null>(null);

  // Pull the saved blood draft down first, so the "continue" button points at
  // the exact screen she stopped on — including from another device.
  useEffect(() => {
    void hydrateBloodDraft().then(() => setBloodResume(getBloodDraftStep()));
  }, []);

  const hairOutstanding = !!status && (!status.hairComplete || !status.styleComplete);
  const bloodOutstanding = !!status && !status.bloodOnFile;
  const consultationOutstanding = !!status && !status.consultationComplete;

  useEffect(() => {
    if (!status) return;
    // Nothing outstanding: this prompt must not appear at all.
    if (!hairOutstanding && !bloodOutstanding && !consultationOutstanding)
      navigate("/home", { replace: true });
  }, [status, hairOutstanding, bloodOutstanding, consultationOutstanding, navigate]);

  if (isLoading && !status) return <LoadingDot />;
  if (!status) return <LoadingDot />;

  const hairPath = status.hairComplete
    ? "/onboarding/profile-step-4-colour"
    : "/onboarding/profile-step-3-hair";

  const bloodPath = (() => {
    if (!status.styleComplete) return "/onboarding/blood-timing";
    const allowed = new Set([
      "/blood-upload",
      "/onboarding/blood-iron-vitamins",
      "/onboarding/blood-minerals",
      "/onboarding/blood-thyroid",
      "/onboarding/blood-hormones",
    ]);
    if (bloodResume && allowed.has(bloodResume)) {
      return bloodResume === "/blood-upload" ? "/blood-upload?onboarding=1" : bloodResume;
    }
    return "/onboarding/blood-timing";
  })();

  const startedBlood = !!bloodResume;

  return (
    <ScreenLayout>
      <TitleBar title="Pick up where you left off" />
      <div className="px-5 pt-2 pb-8 space-y-4">
        <ItalicSub>
          Everything you've answered so far is saved — on this device and any other you sign
          in from. Carry on whenever you're ready.
        </ItalicSub>

        {hairOutstanding && (
          <SurfaceCard>
            <div className="flex items-start gap-3">
              <Scissors className="size-4 mt-1 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold">
                  Ready to add your hair characteristics?
                </p>
                <p className="text-xs text-foreground/75 font-body mt-1 leading-snug">
                  {status.hairComplete
                    ? "Your clinical markers are saved. Colour and styling history is the last part."
                    : "The clinical markers from your consultation — diameter, density, porosity, elasticity and your scalp."}
                </p>
              </div>
            </div>
            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3"
              onClick={() => navigate(hairPath)}
            >
              Continue hair characteristics →
            </Button>
          </SurfaceCard>
        )}

        {bloodOutstanding && (
          <SurfaceCard tone="gold">
            <div className="flex items-start gap-3">
              <Droplets className="size-4 mt-1 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold">
                  Have you had your blood work done yet?
                </p>
                <p className="text-xs text-foreground/80 font-body mt-1 leading-snug">
                  {startedBlood
                    ? "You've already started entering your results — we'll drop you back exactly where you stopped."
                    : "Bring your results when you have them. If you still need a test, we'll show you where to get one."}
                </p>
              </div>
            </div>
            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3"
              onClick={() => navigate(bloodPath)}
              disabled={!status.styleComplete && !hairOutstanding}
            >
              {startedBlood ? "Continue my blood results →" : "Add my blood results →"}
            </Button>
            {!status.styleComplete && (
              <p className="text-[11px] font-body text-foreground/70 mt-2 leading-snug">
                Your hair characteristics come first — your results are read against them.
              </p>
            )}
          </SurfaceCard>
        )}

        <p className="text-[12px] font-body text-muted-foreground text-center leading-snug">
          Both sections are needed before STRAND unlocks, but there's no rush — nothing you've
          entered expires.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default ResumeOnboarding;
