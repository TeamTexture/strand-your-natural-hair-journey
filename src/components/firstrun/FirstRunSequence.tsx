import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ScanLine, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoals } from "@/hooks/useGoals";
import { useChallenges } from "@/hooks/useChallenges";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";
import { setTourActive, TOUR_DONE_EVENT, tourFinished } from "@/lib/firstRunTour";

/**
 * FIRST-RUN SEQUENCE — runs immediately after the guided tour, in this order:
 *
 *   1. Goals + challenges — MANDATORY. A full-screen gate with no close, no
 *      backdrop dismiss and no "later". It stays until the member has a goal
 *      AND at least one challenge on file, because every tip, wash note,
 *      product score and nutrition card is built around those two answers.
 *   2. Add a photo to the current style card — OPTIONAL, skippable.
 *   3. Scan the first product — OPTIONAL, skippable.
 *
 * Each optional step is marked seen in the database on first display, so an
 * ignored prompt never returns on another device. The mandatory gate is only
 * marked seen once it is actually satisfied.
 */
const FirstRunSequence = () => {
  const navigate = useNavigate();
  const { goal, loading: goalsLoading } = useGoals();
  const { challenges, loading: challengesLoading } = useChallenges();

  const goalsNudge = useFirstRunNudge("goals_prompt_seen_at");
  const photoNudge = useFirstRunNudge("photo_prompt_seen_at");
  const productNudge = useFirstRunNudge("product_prompt_seen_at");

  // The tour flags itself finished (this session or a previous one).
  const [tourDone, setTourDone] = useState(() => tourFinished());
  useEffect(() => {
    const on = () => setTourDone(true);
    window.addEventListener(TOUR_DONE_EVENT, on as EventListener);
    return () => window.removeEventListener(TOUR_DONE_EVENT, on as EventListener);
  }, []);

  const [photoDismissed, setPhotoDismissed] = useState(false);
  const [productDismissed, setProductDismissed] = useState(false);

  const loading = goalsLoading || challengesLoading;
  const goalsComplete = !!goal && challenges.length > 0;

  // Goal and challenge are captured in onboarding step one, so the old blocking
  // gate is gone. The flag is simply recorded as seen once both are on file.
  useEffect(() => {
    if (tourDone && !loading && goalsNudge.eligible && goalsComplete) goalsNudge.markSeen();
  }, [tourDone, loading, goalsNudge, goalsComplete]);

  const showPhoto =
    tourDone && !loading && photoNudge.eligible && !photoDismissed;
  const showProduct =
    tourDone &&
    !loading &&
    !showPhoto &&
    (photoDismissed || !photoNudge.eligible) &&
    productNudge.eligible &&
    !productDismissed;

  // Record each optional prompt the moment it is displayed.
  useEffect(() => {
    if (showPhoto) photoNudge.markSeen();
  }, [showPhoto, photoNudge]);
  useEffect(() => {
    if (showProduct) productNudge.markSeen();
  }, [showProduct, productNudge]);

  // No first-run dialog owns the screen any more.
  useEffect(() => {
    setTourActive(false);
  }, []);


  // The mandatory goals/challenges gate has been retired. Goal and challenge are
  // now captured as step one of onboarding, so no existing member — paid or
  // otherwise — should be asked to redo it from a blocking pop-up on Home.



  if (showPhoto) {
    return (
      <NudgeCard
        icon={<Camera className="size-3.5 text-primary" aria-hidden />}
        title="Add a photo of your current style"
        body="Your home screen style card holds your latest photo. It's how you'll see change over time — and how your stylist sees where you're starting from."
        primary="Add a photo"
        onPrimary={() => {
          setPhotoDismissed(true);
          window.dispatchEvent(new Event("strand:open-main-photo"));
        }}
        onSkip={() => setPhotoDismissed(true)}
      />
    );
  }

  if (showProduct) {
    return (
      <NudgeCard
        icon={<ScanLine className="size-3.5 text-primary" aria-hidden />}
        title="Scan your first product"
        body="Scan a bottle, screenshot a page or paste a link. STRAND reads the ingredients and scores it against your hair profile, your goal and your sensitivities."
        primary="Scan a product"
        onPrimary={() => {
          setProductDismissed(true);
          navigate("/products");
        }}
        onSkip={() => setProductDismissed(true)}
      />
    );
  }

  return null;
};

const NudgeCard = ({
  icon,
  title,
  body,
  primary,
  onPrimary,
  onSkip,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  primary: string;
  onPrimary: () => void;
  onSkip: () => void;
}) => (
  <div className="fixed inset-x-0 bottom-[76px] z-[70] px-4">
    <div className="mx-auto max-w-[340px] rounded-[18px] border border-primary/30 bg-background shadow-2xl p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[15px] leading-snug">{title}</p>
          <p className="text-[12px] font-body text-muted-foreground leading-relaxed mt-1">{body}</p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          aria-label="Skip for now"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="gold" size="pill" className="flex-1" onClick={onPrimary}>
          {primary}
        </Button>
        <Button variant="goldGhost" size="pill" className="flex-1" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  </div>
);

export default FirstRunSequence;
