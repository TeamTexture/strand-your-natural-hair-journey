import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSmartInline } from "@/lib/smartInline";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
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
 * The body text is never trimmed. Where the segment is a numbered sequence it
 * is rendered as a StepSequence so the structure carries the reading load.
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
  const { level, showBeginnerHelp } = useTipsLevel();
  const t = TONE_CLASSES[segment.tone];
  const Icon = segment.icon;

  const body = showBeginnerHelp ? plainLanguage(segment.body) : segment.body;
  const steps = useMemo(
    () => (looksSequential(body) ? splitNumberedSteps(body) : []),
    [body],
  );

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
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/85 font-body break-words">
          {render(body, keyPrefix)}
        </p>
      )}

      {level >= 3 && <KeyFactChips className="mt-2.5" text={body} />}
    </div>
  );
};

export default SegmentBlock;
