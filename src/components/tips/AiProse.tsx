import { useMemo } from "react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { condenseProse, splitSentences } from "@/lib/tipsRender";
import { pickTipIcon } from "@/components/beginner/BeginnerGuide";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { cn } from "@/lib/utils";

/**
 * Renders any AI-generated or editorial prose at the user's support level.
 *
 * Level 1 — first sentence only (the direct answer).
 * Level 2 — up to three sentences (a short paragraph).
 * Level 3 — the full text as written.
 * Level 4 — the full text broken into short icon-led plain-English lines.
 *
 * Used for hair summaries, product summaries, blood-marker overviews,
 * nutrition guidance and every other block of generated copy.
 */
const AiProse = ({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) => {
  const { level } = useTipsLevel();
  const body = useMemo(() => condenseProse(text, level), [text, level]);
  if (!body) return null;

  if (level >= 4) {
    const lines = splitSentences(body);
    return (
      <div key={level} className={cn("space-y-2 animate-in fade-in-0 duration-300", className)}>
        {lines.map((line, i) => {
          const Icon = pickTipIcon(line);
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="size-7 rounded-full bg-primary/12 flex items-center justify-center shrink-0 mt-[1px]">
                <Icon className="size-3.5 text-primary" />
              </span>
              <p className="flex-1 text-[13.5px] leading-relaxed text-foreground/90">
                {plainLanguage(line)}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <p
      key={level}
      className={cn(
        "text-[13px] leading-relaxed text-foreground/85 whitespace-pre-wrap animate-in fade-in-0 duration-300",
        className,
      )}
    >
      {body}
    </p>
  );
};

export default AiProse;
