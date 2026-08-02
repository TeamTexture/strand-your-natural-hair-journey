import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";
import { leadPhrase } from "@/lib/tipsRender";

export type MarkerSeverity = "deficient" | "high" | "borderline" | "optimal";

/** Humanise a possibly snake_case / lower-case marker name for display. */
export function humaniseMarker(marker: string): string {
  if (!marker) return marker;
  if (!/[_-]/.test(marker) && /[A-Z]/.test(marker)) return marker; // already formatted
  return marker
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEVERITY_META: Record<
  MarkerSeverity,
  { tone: GuidanceTone; text: string; dot: string }
> = {
  deficient: { tone: "warning", text: "Deficient", dot: "bg-destructive" },
  high: { tone: "warning", text: "High", dot: "bg-destructive" },
  borderline: { tone: "gold", text: "Borderline", dot: "bg-primary" },
  optimal: { tone: "good", text: "Optimal", dot: "bg-good" },
};

/**
 * MarkerBadgeRow — the shared blood-marker anatomy: humanised marker name +
 * a severity-tinted status pill + a small urgency dot, with the plain-English
 * hair-impact line as light supporting text beneath. Used on every blood
 * surface (onboarding summary, panel review, history, home) so a flagged
 * marker always reads the same way.
 */
const MarkerBadgeRow = ({
  marker,
  severity,
  statusLabel,
  value,
  impact,
  className,
}: {
  marker: string;
  severity: MarkerSeverity;
  /** Override the default severity word, e.g. a specific status string. */
  statusLabel?: string;
  value?: string | null;
  /** The plain-English "why this matters for your hair" supporting line. */
  impact?: string | null;
  className?: string;
}) => {
  const meta = SEVERITY_META[severity];
  const t = TONE_CLASSES[meta.tone];
  const impactText = impact?.trim();
  const long = !!impactText && impactText.length > 80;
  const { phrase, rest } = long ? leadPhrase(impactText!) : { phrase: "", rest: "" };

  return (
    <div className={cn("py-2.5", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("inline-flex size-2 rounded-full shrink-0", meta.dot)} aria-hidden />
        <p className="text-sm font-body font-semibold text-foreground min-w-0">
          {humaniseMarker(marker)}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-semibold font-body uppercase tracking-wide shrink-0",
            t.chip,
            t.label,
          )}
        >
          {statusLabel ?? meta.text}
        </span>
        {value && (
          <span className="text-xs font-body text-muted-foreground ml-auto shrink-0">{value}</span>
        )}
      </div>
      {impactText && (
        <p className="mt-1 text-xs leading-relaxed font-body text-foreground/75 break-words">
          {long ? (
            <>
              <span className="font-semibold text-foreground">{phrase}</span> {rest}
            </>
          ) : (
            impactText
          )}
        </p>
      )}
    </div>
  );
};

export default MarkerBadgeRow;
