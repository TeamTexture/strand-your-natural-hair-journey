import { Lightbulb } from "lucide-react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import {
  DEFAULT_TIPS_LEVEL,
  TIPS_LEVELS,
  TIPS_LEVEL_HINT,
  TIPS_LEVEL_LABEL,
} from "@/lib/tipsLevel";
import { cn } from "@/lib/utils";

/**
 * One-time inline prompt shown the first time a user sees a tips section.
 * Asks how much guidance they want across the app, then never appears again
 * (the answer is stored on their profile).
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
            How much guidance do you want? You can change this anytime in
            settings.
          </p>
          <div className="grid gap-1.5 mt-2">
            {TIPS_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => answerPrompt(lv)}
                className={cn(
                  "text-left px-3 py-2 rounded-[10px] border transition-colors",
                  lv === DEFAULT_TIPS_LEVEL
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                <span className="block text-[11px] font-semibold">
                  {lv}. {TIPS_LEVEL_LABEL[lv]}
                  {lv === DEFAULT_TIPS_LEVEL && (
                    <span className="font-normal text-muted-foreground"> · recommended</span>
                  )}
                </span>
                <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">
                  {TIPS_LEVEL_HINT[lv]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TipsLevelPrompt;
