import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Droplets, Scissors, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { getBloodDraftStep, hydrateBloodDraft } from "@/hooks/useBloodValues";
import { clearResumeLock, setResumeLock } from "@/lib/onboardingLock";
import { getOnboardingNextPath, getOnboardingRequirements } from "@/lib/onboardingDecision";

/**
 * Pick-up-where-you-left-off screen.
 *
 * All three required pieces (professional consultation, hair characteristics,
 * blood work) are always shown. Anything already done is greyed out and marked
 * as added, so a member who has just uploaded her bloods can see it landed and
 * see exactly what is still owed. Nothing here unlocks the app: once all three
 * are genuinely complete she goes on to payment (or Home if she already pays).
 */
const ResumeOnboarding = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: status, isLoading } = useOnboardingStatus();
  const { hasAccess, isLoading: subLoading } = useConsumerSubscription();
  const [bloodResume, setBloodResume] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleSaveAndSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (e) {
      setSigningOut(false);
      console.error("[sign out] failed", e);
      toast.error("Sign out failed — check your connection and try again.");
    }
  };

  // Pull the saved blood draft down first, so the "continue" button points at
  // the exact screen she stopped on — including from another device.
  useEffect(() => {
    void hydrateBloodDraft().then(() => setBloodResume(getBloodDraftStep()));
  }, []);

  const requirements = status ? getOnboardingRequirements(status) : null;
  const hairOutstanding = requirements?.hairOutstanding ?? false;
  const bloodOutstanding = requirements?.bloodOutstanding ?? false;
  const consultationOutstanding = requirements?.consultationOutstanding ?? false;
  // Only these two gate Subscribe/app access. The consultation is optional.
  const coreComplete = !!requirements?.coreComplete;

  useEffect(() => {
    if (!status) return;
    // Nothing outstanding: this prompt must not appear at all. Continue the
    // original flow — payment, then the app.
    if (coreComplete) {
      clearResumeLock();
      if (subLoading) return;
      // Reuse the SAME target the linear onboarding flow uses immediately after
      // blood work is saved (see BloodHormones) — nothing bespoke here.
      navigate(getOnboardingNextPath(status, hasAccess), { replace: true });
      return;
    }
    // Something still outstanding — pin back navigation to this screen for the
    // rest of the session (dataComplete is the only thing that releases it).
    if (!status.dataComplete) setResumeLock();
    else clearResumeLock();
  }, [status, coreComplete, navigate, hasAccess, subLoading]);

  if (isLoading && !status) return <LoadingDot />;

  if (!status) return <LoadingDot />;

  // The clinical markers come FROM the consultation, so who she saw and when has
  // to be logged before the markers form is ever reached. Jumping straight to the
  // markers screen skipped the most important part of this flow.
  const hairPath = !status.consultationComplete
    ? "/onboarding/pro-details"
    : status.hairComplete
      ? "/onboarding/profile-step-4-colour"
      : "/onboarding/profile-step-3-hair";

  const bloodPath = (() => {
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

  // Something already done: shown greyed out so she can see it landed, with the
  // outstanding pieces still listed below.
  const DoneCard = ({ icon, title, note }: { icon: React.ReactNode; title: string; note?: string }) => (
    <SurfaceCard className="opacity-60">
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-muted-foreground">{title}</p>
          <p className="text-xs text-muted-foreground font-body mt-1 leading-snug inline-flex items-center gap-1">
            <Check className="size-3" aria-hidden="true" /> Added — nothing more to do here.
          </p>
          {note && (
            <p className="text-xs text-muted-foreground font-body mt-1 leading-snug">{note}</p>
          )}
        </div>
      </div>
    </SurfaceCard>
  );

  return (
    <ScreenLayout>
      <TitleBar title="Pick up where you left off" />
      <div className="px-5 pt-2 pb-8 space-y-4">
        <ItalicSub>
          Everything you've answered so far is saved — on this device and any other you sign
          in from. Carry on whenever you're ready.
        </ItalicSub>

        {!consultationOutstanding && (
          <DoneCard icon={<Stethoscope className="size-4" />} title="Professional consultation" />
        )}
        {!bloodOutstanding && (
          <DoneCard
            icon={<Droplets className="size-4" />}
            title="Blood work"
            note={hairOutstanding ? "Your hair characteristics are still to add." : undefined}
          />
        )}
        {!hairOutstanding && (
          <DoneCard
            icon={<Scissors className="size-4" />}
            title="Hair characteristics"
            note={bloodOutstanding ? "Your blood work is still to add." : undefined}
          />
        )}




        {coreComplete && (
          <SurfaceCard tone="gold">
            <p className="font-display text-base font-semibold">
              That's everything STRAND needs.
            </p>
            <p className="text-xs text-foreground/80 font-body mt-1 leading-snug">
              Your hair characteristics and blood work are both in. Choose your membership to
              unlock STRAND.
            </p>
            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3 whitespace-normal break-words leading-tight"
              onClick={() => navigate(getOnboardingNextPath(status, hasAccess))}
            >
              {hasAccess ? "Go to STRAND \u2192" : "Subscribe now \u2192"}
            </Button>
          </SurfaceCard>
        )}

        {consultationOutstanding && (
          <SurfaceCard>
            <div className="flex items-start gap-3">
              <Stethoscope className="size-4 mt-1 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold">
                  Ready to book a professional consultation?
                </p>
                <p className="text-xs text-foreground/75 font-body mt-1 leading-snug">
                  Your hair characteristics come from a trichologist, dermatologist or curl
                  specialist. Book with a vetted professional, then log who you saw and when.
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Button
                variant="gold"
                size="pill"
                className="w-full whitespace-normal break-words leading-tight"
                onClick={() => navigate("/directory?consultation=1")}
              >
                Find a professional →
              </Button>
              <Button
                variant="outline"
                size="pill"
                className="w-full whitespace-normal break-words leading-tight"
                onClick={() => navigate("/onboarding/pro-details")}
              >
                I've already had one →
              </Button>
            </div>
          </SurfaceCard>
        )}

        {hairOutstanding && (
          <SurfaceCard>
            <div className="flex items-start gap-3">
              <Scissors className="size-4 mt-1 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold">
                  Ready to add your hair characteristics?
                </p>
                <p className="text-xs text-foreground/75 font-body mt-1 leading-snug">
                  {!status.consultationComplete
                    ? "First, log who you saw and when — your clinical markers come from that consultation."
                    : status.hairComplete
                      ? "Your clinical markers are saved. Colour and styling history is the last part."
                      : "The clinical markers from your consultation — diameter, density, porosity, elasticity and your scalp."}
                </p>
              </div>
            </div>
            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3 whitespace-normal break-words leading-tight"
              onClick={() => navigate(hairPath)}
            >
              Continue →
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
              className="w-full mt-3 whitespace-normal break-words leading-tight"
              onClick={() => navigate(bloodPath)}
            >
              {startedBlood ? "Continue my blood results →" : "Add my blood results →"}
            </Button>

          </SurfaceCard>
        )}

        <p className="text-[12px] font-body text-muted-foreground text-center leading-snug">
          {coreComplete
            ? "Booking a consultation is optional and you can do it any time — it never holds up your membership."
            : "Your hair characteristics and blood work are both needed before STRAND unlocks, but there's no rush — nothing you've entered expires."}
        </p>
      </div>
    </ScreenLayout>
  );
};

export default ResumeOnboarding;
