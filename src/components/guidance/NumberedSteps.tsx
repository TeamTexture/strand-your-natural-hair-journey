import { cn } from "@/lib/utils";
import { useSmartInline } from "@/lib/smartInline";

/**
 * NumberedSteps — a numbered sequence. Each step is a 24px circle carrying the
 * number in the gold/primary token on a subtle tinted fill with a hairline
 * border, then one sentence. No pills, no coloured text blocks.
 */
const NumberedSteps = ({
  steps,
  idPrefix = "step",
  className,
}: {
  steps: string[];
  idPrefix?: string;
  className?: string;
}) => {
  const render = useSmartInline();
  if (!steps.length) return null;
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((s, i) => (
        <li key={`${idPrefix}-${i}`} className="flex items-start gap-3">
          <span
            className="mt-[1px] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-[11px] font-bold font-body text-primary"
            aria-hidden
          >
            {i + 1}
          </span>
          <p className="flex-1 min-w-0 text-[13.5px] leading-relaxed font-body text-foreground break-words">
            {render(s, `${idPrefix}-${i}`)}
          </p>
        </li>
      ))}
    </ol>
  );
};

export default NumberedSteps;
