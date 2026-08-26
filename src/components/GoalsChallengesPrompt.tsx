import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoals } from "@/hooks/useGoals";
import { useChallenges } from "@/hooks/useChallenges";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";

/**
 * First-login nudge to set goals and challenges — in the member's own words.
 * Shows only AFTER the home tour has finished (the tour already ends on this
 * ask, so the two never appear at once), only while BOTH goals and challenges
 * are empty, and is dismissible. A dismissal snoozes it; it returns later if
 * both are still empty, and never shows again once either is filled.
 */
const TOUR_KEY = "strand_home_tour_seen_v3";

const GoalsChallengesPrompt = ({
  onAddGoal,
  onAddChallenges,
}: {
  onAddGoal: () => void;
  onAddChallenges: () => void;
}) => {
  const { goal, loading: goalsLoading } = useGoals();
  const { challenges, loading: challengesLoading } = useChallenges();
  const { eligible, markSeen } = useFirstRunNudge("goals_prompt_seen_at");
  const [ready, setReady] = useState(false);

  const empty = !goal && challenges.length === 0;

  useEffect(() => {
    if (goalsLoading || challengesLoading || !empty || !eligible) {
      setReady(false);
      return;
    }
    let tourSeen = false;
    try {
      tourSeen = !!localStorage.getItem(TOUR_KEY);
    } catch {}
    if (!tourSeen) return;
    // Let the tour's own closing dialog clear first.
    const t = setTimeout(() => {
      setReady(true);
      markSeen();
    }, 1200);
    return () => clearTimeout(t);
  }, [goalsLoading, challengesLoading, empty, eligible, markSeen]);

  if (!ready || !empty) return null;

  const dismiss = () => setReady(false);

  return (
    <div className="fixed inset-x-0 bottom-[76px] z-[70] px-4">
      <div className="mx-auto max-w-[340px] rounded-[18px] border border-primary/30 bg-background shadow-2xl p-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-snug">
              Tell STRAND what you're working towards
            </p>
            <p className="text-[12px] font-body text-muted-foreground leading-relaxed mt-1">
              Your goals and what's getting in the way — in your own words. They
              shape every tip you'll see.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button
            variant="gold"
            size="pill"
            className="min-w-0 px-2 text-[12px] tracking-tight whitespace-nowrap"
            onClick={() => {
              dismiss();
              onAddGoal();
            }}
          >
            Add goals
          </Button>
          <Button
            variant="goldOutline"
            size="pill"
            className="min-w-0 px-2 text-[12px] tracking-tight whitespace-nowrap"

            onClick={() => {
              dismiss();
              onAddChallenges();
            }}
          >
            Add challenges
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GoalsChallengesPrompt;
