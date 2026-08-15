import { cn } from "@/lib/utils";
import { Timer } from "lucide-react";
import { useSmartInline } from "@/lib/smartInline";
import { extractTime, plainLanguage } from "@/components/beginner/BeginnerGuide";
import { guidanceIcon } from "@/lib/guidance";
import { dedupeSentences } from "@/lib/tipsRender";

export interface GuidanceStep {
  text: string;
  detail?: string;
  /** Reason this step matters — rendered in dark ink, never gold on cream. */
  why?: string;
  /** Action word used to pick the icon when the headline itself is neutral. */
  iconHint?: string;
}

/**
 * StepSequence — numbered gold circles joined by a connecting line, for any
 * sequential instruction. Used heavily at hand-holding level, where every step
 * stays visible at once (never collapsed, never one-at-a-time).
 */
const StepSequence = ({
  steps,
  className,
  startNumber = 1,
}: {
  steps: GuidanceStep[];
  className?: string;
  /** First number in the sequence — lets stage-grouped lists keep counting. */
  startNumber?: number;
}) => {
  const render = useSmartInline();
  if (steps.length === 0) return null;

  return (
    <ol className={cn("relative space-y-3", className)}>
      {/* Connecting line behind the numbered circles. */}
      <span
        aria-hidden
        className="absolute left-[13px] top-3 bottom-3 w-px bg-primary/25"
      />
      {steps.map((s, i) => {
        const Icon = guidanceIcon(s.iconHint ? `${s.iconHint} ${s.text}` : s.text);
        const time = extractTime(s.text);
        // Definitions are never appended inline — plainLanguage only cleans the
        // copy. A step body and its why-line are deduped against each other.
        const body = plainLanguage(s.text);
        const seen = new Set<string>();
        const cleanBody = dedupeSentences(body, seen);
        const detail = s.detail ? dedupeSentences(plainLanguage(s.detail), seen) : "";
        const why = s.why ? dedupeSentences(plainLanguage(s.why), seen) : "";
        return (
          <li key={i} className="relative flex gap-3">
            <span className="relative z-10 size-[27px] shrink-0 rounded-full bg-primary text-primary-foreground text-[11.5px] font-bold flex items-center justify-center shadow-sm">
              {startNumber + i}
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-start gap-1.5">
                <Icon className="size-3.5 text-primary shrink-0 mt-[3px]" aria-hidden />
                <p className="flex-1 min-w-0 text-[12px] leading-[1.6] text-foreground break-words [overflow-wrap:anywhere]">
                  {render(cleanBody, `step-${i}`)}
                </p>
              </div>
              {detail && (
                <p className="mt-1 text-[12px] leading-[1.6] text-muted-foreground break-words [overflow-wrap:anywhere] pl-5">
                  {render(detail, `step-detail-${i}`)}
                </p>
              )}
              {why && (
                <p className="mt-1 text-[11.5px] leading-snug text-foreground/75 break-words pl-5">
                  {render(why, `step-why-${i}`)}
                </p>
              )}
              {time && (
                <span className="mt-1.5 ml-5 inline-flex items-center gap-1 rounded-pill bg-primary/12 text-primary px-2 py-0.5 text-[10px] font-semibold">
                  <Timer className="size-3" />
                  {time}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default StepSequence;
