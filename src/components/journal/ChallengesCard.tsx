import { useState } from "react";
import { Pencil, AlertTriangle } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useChallenges } from "@/hooks/useChallenges";
import ChallengesEditorSheet from "@/components/journal/ChallengesEditorSheet";

/**
 * Current biggest challenges — its own card, its own editor. Deliberately
 * separate from the goal card: a member can be working toward length
 * retention while struggling with shedding. Two different inputs, both fed
 * into AI personalisation.
 */
const ChallengesCard = () => {
  const { challenges, loading } = useChallenges();
  const [open, setOpen] = useState(false);

  return (
    <>
      <SurfaceCard>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-7 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-3.5 text-primary" />
            </span>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
              Current biggest challenges
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Edit challenges"
            className="size-8 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary shrink-0"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="h-4 w-2/3 bg-border/60 rounded animate-pulse mt-3" />
        ) : challenges.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {challenges.map((c, i) => (
                <span
                  key={c}
                  className={
                    i === 0
                      ? "text-xs px-2.5 py-1 rounded-full bg-primary/15 border border-primary/25 text-foreground leading-snug"
                      : "text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground leading-snug"
                  }
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="text-[11px] font-body text-muted-foreground mt-2.5">
              Your first challenge is treated as the biggest one — STRAND leads
              your guidance with it.
            </p>
          </>
        ) : (
          <div className="mt-3 space-y-2.5">
            <p className="text-[12px] font-body text-muted-foreground leading-relaxed">
              What's getting in the way right now? Shedding, breakage, dryness,
              time. Keep this separate from your goal — put your biggest challenge
              first.
            </p>
            <Button variant="goldGhost" size="pill" onClick={() => setOpen(true)}>
              + Add a challenge
            </Button>
          </div>
        )}
      </SurfaceCard>

      <ChallengesEditorSheet open={open} onOpenChange={setOpen} />
    </>
  );
};

export default ChallengesCard;
