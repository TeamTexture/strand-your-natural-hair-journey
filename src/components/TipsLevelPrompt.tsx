import { Lightbulb } from "lucide-react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { cn } from "@/lib/utils";

/**
 * One-time inline prompt shown the first time a user sees a tips section.
 * Asks whether they want essentials only or full guidance, then never
 * appears again (the answer is stored on their profile).
 */
const TipsLevelPrompt = ({ className }: { className?: string }) => {
  const { needsPrompt, answerPrompt } = useTipsLevel();
  if (!needsPrompt) return null;

  return (
    <div
      className={cn(
        "rounded-[12px] border border-primary/30 bg-primary/5 p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Lightbulb className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] leading-snug text-foreground/85">
            Want just the essentials, or full guidance? You can change this
            anytime in settings.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => answerPrompt("essential")}
              className="flex-1 py-2 rounded-pill border border-primary/40 text-[11px] font-medium text-primary"
            >
              Just the essentials
            </button>
            <button
              type="button"
              onClick={() => answerPrompt("detailed")}
              className="flex-1 py-2 rounded-pill bg-primary text-primary-foreground text-[11px] font-medium"
            >
              Full guidance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TipsLevelPrompt;
