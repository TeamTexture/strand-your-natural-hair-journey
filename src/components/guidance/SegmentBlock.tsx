import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSmartInline } from "@/lib/smartInline";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { emphasisSplit, splitToBlocks } from "@/lib/tipsRender";
import { capitaliseSentences } from "@/lib/paragraphs";
import {
  TONE_CLASSES,
  looksSequential,
  splitNumberedSteps,
  type GuidanceSegment,
} from "@/lib/guidance";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import StepSequence from "@/components/guidance/StepSequence";

/**
 * SegmentBlock — one labelled sub-paragraph of AI guidance ("Why it matters:",
 * "Technique:", "Watch for:") rendered as its own tinted box with an icon and a
 * small styled header instead of inline bold text.
 *
 * No text is dropped. Where the segment is a numbered sequence it becomes a
 * StepSequence; where it is a multi-topic paragraph it is split at sentence
 * boundaries into separate paragraphs inside the block budget, first sentence
 * bolded as the lead-in.
 */
const SegmentBlock = ({
  segment,
  className,
  keyPrefix = "seg",
}: {
  segment: GuidanceSegment;
  className?: string;
  keyPrefix?: string;
}) => {
  const render = useSmartInline();
  const { level } = useTipsLevel();
  const t = TONE_CLASSES[segment.tone];
  const Icon = segment.icon;

  const body = plainLanguage(segment.body);
  const steps = useMemo(
    () => (looksSequential(body) ? splitNumberedSteps(body) : []),
    [body],
  );
  const blocks = useMemo(() => splitToBlocks(body).map((b) => capitaliseSentences(b)), [body]);

  return (
    <div className={cn("rounded-[12px] border p-3", t.box, className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center justify-center size-7 rounded-full border shrink-0",
            t.chip,
          )}
        >
          <Icon className={cn("size-3.5", t.icon)} aria-hidden />
        </span>
        <p className={cn("text-[9.5px] uppercase tracking-[0.2em] font-bold font-body", t.label)}>
          {segment.label}
        </p>
      </div>

      {steps.length > 0 ? (
        <StepSequence className="mt-2.5" steps={steps.map((text) => ({ text }))} />
      ) : (
        <div className="mt-2 space-y-2">
          {blocks.map((block, i) => {
            // Only the short lead-in phrase is emphasised — never the whole
            // paragraph.
            const { phrase, rest } = emphasisSplit(block);
            return (
              <p key={i} className="text-[11.5px] leading-[1.6] font-body break-words [overflow-wrap:anywhere]">
                <span className={i === 0 ? "text-foreground font-semibold" : "text-foreground/85"}>
                  {render(phrase, `${keyPrefix}-b${i}`)}
                </span>
                {rest && (
                  <span className="text-foreground/75">
                    {" "}
                    {render(rest, `${keyPrefix}-b${i}-rest`)}
                  </span>
                )}
              </p>
            );
          })}
        </div>
      )}


      {level >= 3 && <KeyFactChips className="mt-2.5" text={body} />}
    </div>
  );
};

export default SegmentBlock;
