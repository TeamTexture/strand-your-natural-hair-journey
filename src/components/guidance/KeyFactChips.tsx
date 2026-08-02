import { cn } from "@/lib/utils";
import { extractKeyFacts } from "@/lib/guidance";

/**
 * KeyFactChips — extract-and-highlight. The concrete parameters buried in
 * guidance prose (frequency, duration, tool, porosity, section count) are
 * repeated as small pills so they can be scanned at a glance.
 *
 * The originating sentence is left completely intact; this is additive.
 */
const KeyFactChips = ({
  text,
  facts,
  max = 4,
  className,
}: {
  text?: string | null;
  /** Pre-built chips, when the caller already knows the parameters. */
  facts?: Array<{ label: string; icon?: React.ComponentType<{ className?: string }> }>;
  max?: number;
  className?: string;
}) => {
  const items = facts ?? extractKeyFacts(text, max);
  if (items.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((f, i) => {
        const Icon = f.icon;
        return (
          <li
            key={`${f.label}-${i}`}
            className="inline-flex items-center gap-1 rounded-pill border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10.5px] font-semibold text-primary font-body"
          >
            {Icon && <Icon className="size-3" />}
            {f.label}
          </li>
        );
      })}
    </ul>
  );
};

export default KeyFactChips;
