import { cn } from "@/lib/utils";
import { extractKeyFacts, TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * KeyFactChips — extract-and-highlight. The concrete parameters buried in
 * guidance prose (frequency, duration, tool, porosity, section count) are
 * repeated as small pills so they can be scanned at a glance. Facts with real
 * severity (a goal being worked against, a flagged marker) pass a tone so the
 * colour carries meaning.
 *
 * The originating sentence is left completely intact; this is additive.
 */
const KeyFactChips = ({
  text,
  facts,
  max = 5,
  min = 2,
  tone = "gold",
  className,
}: {
  text?: string | null;
  /** Pre-built chips, when the caller already knows the parameters. */
  facts?: Array<{ label: string; icon?: React.ComponentType<{ className?: string }>; tone?: GuidanceTone }>;
  max?: number;
  /** A single lonely chip reads as random — hide the row below this count. */
  min?: number;
  tone?: GuidanceTone;
  className?: string;
}) => {
  const items = facts ?? extractKeyFacts(text, max);
  if (items.length < (facts ? 1 : min)) return null;
  return (
    <ul className={cn("flex flex-wrap items-start gap-1.5 py-0.5", className)}>
      {items.map((f, i) => {
        const Icon = f.icon;
        const t = TONE_CLASSES[("tone" in f && f.tone) || tone];
        return (
          <li
            key={`${f.label}-${i}`}
            className={cn(
              "inline-flex max-w-full items-start gap-1 rounded-pill border px-2.5 py-1 text-[10.5px] font-semibold font-body leading-snug text-left whitespace-normal [overflow-wrap:anywhere]",
              t.chip,
              t.label,
            )}
          >
            {Icon && <Icon className="size-3 shrink-0 mt-[1px]" />}
            <span className="min-w-0">{f.label}</span>
          </li>
        );
      })}
    </ul>
  );
};

export default KeyFactChips;
