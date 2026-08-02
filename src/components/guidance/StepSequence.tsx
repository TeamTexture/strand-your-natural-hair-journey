import { cn } from "@/lib/utils";
import { Timer } from "lucide-react";
import { useSmartInline } from "@/lib/smartInline";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { extractTime, plainLanguage } from "@/components/beginner/BeginnerGuide";
import { guidanceIcon } from "@/lib/guidance";

export interface GuidanceStep {
  text: string;
  detail?: string;
}

/**
 * StepSequence — numbered gold circles joined by a connecting line, for any
 * sequential instruction. Used heavily at hand-holding level, where every step
 * stays visible at once (never collapsed, never one-at-a-time).
 */
const StepSequence = ({
  steps,
  className,
}: {
  steps: GuidanceStep[];
  className?: string;
}) => {
  const render = useSmartInline();
  const { showBeginnerHelp } = useTipsLevel();
  if (steps.length === 0) return null;

  return (
    <ol className={cn("relative space-y-3", className)}>
      {/* Connecting line behind the numbered circles. */}
      <span
        aria-hidden
        className="absolute left-[13px] top-3 bottom-3 w-px bg-primary/25"
      />
      {steps.map((s, i) => {
        const Icon = guidanceIcon(s.text);
        const time = extractTime(s.text);
        const body = showBeginnerHelp ? plainLanguage(s.text) : s.text;
        const detail = s.detail ? (showBeginnerHelp ? plainLanguage(s.detail) : s.detail) : undefined;
        return (
          <li key={i} className="relative flex gap-3">
            <span className="relative z-10 size-[27px] shrink-0 rounded-full bg-primary text-primary-foreground text-[11.5px] font-bold flex items-center justify-center shadow-sm">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-start gap-1.5">
                <Icon className="size-3.5 text-primary shrink-0 mt-[3px]" aria-hidden />
                <p className="flex-1 text-[12px] leading-[1.55] text-foreground break-words">
                  {render(body, `step-${i}`)}
                </p>
              </div>
              {detail && (
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground break-words pl-5">
                  {render(detail, `step-detail-${i}`)}
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
