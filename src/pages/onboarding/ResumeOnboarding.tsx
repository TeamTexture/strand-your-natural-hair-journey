import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Droplets, Scissors } from "lucide-react";
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
import OptionalBadge from "@/components/blood/OptionalBadge";
import BloodWorkSkippedCard from "@/components/blood/BloodWorkSkippedCard";
import { useBloodSkipped } from "@/lib/bloodSkip";
import { clearResumeLock, setResumeLock } from "@/lib/onboardingLock";
import { getOnboardingNextPath, getOnboardingRequirements } from "@/lib/onboardingDecision";


/**
 * Pick-up-where-you-left-off screen.
 *
 * Hair characteristics are what unlock STRAND; blood work is optional and opens
 * the diet and nutrition side. Both are always shown. Anything already done is
 * greyed out and marked as added, so a member who has just uploaded her bloods
 * can see it landed and see exactly what is still owed. Nothing here unlocks the
 * app: once the hair characteristics are genuinely complete she goes on to
 * payment (or Home if she already pays).
 */
const ResumeOnboarding = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: status, isLoading } = useOnboardingStatus();
  const { hasAccess, isLoading: subLoading } = useConsumerSubscription();
  const [bloodResume, setBloodResume] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const { skipped: bloodSkipped, skip: skipBlood, unskip: unskipBlood } = useBloodSkipped();


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
  // Hair characteristics gate Subscribe/app access. Blood work gates nothing
  // about access — it only opens diet and nutrition.
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
    // Signing back in must always land HERE, never deep inside a form. The
    // linear flow still hands over directly step-to-step (see
    // useOnboardingCompletion); this screen never forwards on its own.
  }, [status, coreComplete, navigate, hasAccess, subLoading]);


  if (isLoading && !status) return <LoadingDot />;

  if (!status) return <LoadingDot />;

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
            note={bloodOutstanding ? "Blood work is optional — add it whenever you like." : undefined}
          />
        )}




        {coreComplete && (
          <SurfaceCard tone="gold">
            <p className="font-display text-base font-semibold">
              That's everything STRAND needs.
            </p>
            <p className="text-xs text-foreground/80 font-body mt-1 leading-snug">
              {hasAccess
                ? "Your hair characteristics are in. STRAND is ready for you."
                : "Your hair characteristics are in. Choose your membership to unlock STRAND."}
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

        {hairOutstanding && (
          <SurfaceCard>
            <div className="flex items-start gap-3">
              <Scissors className="size-4 mt-1 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold">Hair characteristics</p>
                <p className="text-xs text-foreground/75 font-body mt-1 leading-snug">
                  Six quick questions about your hair and scalp — everything you've already
                  entered is saved.
                </p>
              </div>
            </div>
            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3 whitespace-normal break-words leading-tight"
              onClick={() =>
                navigate(
                  status.hairComplete
                    ? "/onboarding/profile-step-4-colour"
                    : "/onboarding/profile-step-3-hair",
                )
              }
            >
              Continue my hair characteristics →
            </Button>
          </SurfaceCard>
        )}


        {bloodOutstanding && (
          bloodSkipped ? (
            <BloodWorkSkippedCard
              onAdd={() => {
                void unskipBlood();
                navigate(bloodPath);
              }}
            />
          ) : (
            <SurfaceCard tone="gold">
              <OptionalBadge />
              <div className="flex items-start gap-3 mt-2">
                <Droplets className="size-4 mt-1 text-primary shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold">Blood work</p>
                  {startedBlood ? (
                    <p className="text-xs text-foreground/80 font-body mt-1 leading-snug">
                      You've already started entering your results — we'll drop you back
                      exactly where you stopped.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-foreground/80 font-body mt-1 leading-snug">
                        You don't need this to use STRAND. It only opens the diet and
                        nutrition section — everything else works without it.
                      </p>
                      <p className="text-xs text-foreground/80 font-body mt-2 leading-snug">
                        Add your results whenever you're ready.
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <Button
                  variant="gold"
                  size="pill"
                  className="w-full whitespace-normal break-words leading-tight"
                  onClick={() => navigate(bloodPath)}
                >
                  {startedBlood ? "Continue my blood results →" : "Add my blood results →"}
                </Button>
                <Button
                  variant="outline"
                  size="pill"
                  className="w-full whitespace-normal break-words leading-tight"
                  onClick={() => void skipBlood()}
                >
                  Skip — I'll decide later
                </Button>
              </div>
            </SurfaceCard>
          )
        )}


        <p className="text-[12px] font-body text-muted-foreground text-center leading-snug">
          {coreComplete
            ? "Blood work is optional and you can add it any time — it opens the diet and nutrition side and never holds up your membership."
            : "Your hair characteristics are what STRAND needs to unlock. Blood work is optional — it opens the diet and nutrition side. There's no rush: nothing you've entered expires."}
        </p>

        <Button
          variant="outline"
          size="pill"
          className="w-full whitespace-nowrap leading-tight"
          disabled={signingOut}
          onClick={handleSaveAndSignOut}
        >
          {signingOut ? "Saving…" : "Save & sign out"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ResumeOnboarding;
