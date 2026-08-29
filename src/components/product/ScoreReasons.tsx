import { Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlossaryTerm } from "@/components/ingredients/IngredientToken";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";


export interface ScoreReason {
  direction: "plus" | "minus";
  factor: string;
  reason: string;
}

/** Narrows unknown stored/AI data into the strict row shape. */
export function parseScoreReasons(value: unknown): ScoreReason[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const direction: ScoreReason["direction"] | null =
      row.direction === "plus" || row.direction === "minus" ? row.direction : null;

    const factor = typeof row.factor === "string" ? row.factor.trim() : "";
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    if (!direction || !factor || !reason) return [];
    return [{ direction, factor, reason }];
  }).slice(0, 4);
}

/**
 * Frequency observations ("this ingredient appears in 3+ of your products") are
 * neutral information, never a warning: they carry no safety, quality or
 * suitability meaning and must never render with alert styling. Declared
 * allergies and sensitivities are a separate dataset and keep the alert look.
 */
const FREQUENCY_PATTERNS = [
  /\bflagged\b/i,
  /\bappears? in \w+ (?:of )?(?:your|the) (?:saved )?products\b/i,
  /\bappears? in \w+ (?:of )?the products on your shelf\b/i,
  /\bacross (?:your|\w+ of your) (?:saved )?products\b/i,
  /\balready (?:own|owns|use|uses)\b/i,
  /\bon your shelf\b/i,
  /\brecurs? across\b/i,
];

const SENSITIVITY_PATTERNS = [/\bsensitivit/i, /\ballerg/i, /\bintoleran/i];

export function isFrequencyReason(r: ScoreReason): boolean {
  const text = `${r.factor} ${r.reason}`;
  if (SENSITIVITY_PATTERNS.some((re) => re.test(text))) return false;
  return FREQUENCY_PATTERNS.some((re) => re.test(text));
}

/** The standing heading for the ranked rows, derived from the score band. */
export function scoreReasonsHeading(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score) || score <= 0) return "Why it scored this way";
  if (score >= 70) return "Why it scored this high";
  if (score >= 50) return "Why it scored where it did";
  return "Why it scored this low";
}

/**
 * The STANDARD verdict rationale: ranked "why it scored this" callouts, the
 * strongest driver first, each naming the ingredient or formulation property
 * doing the work and the mechanism-to-profile reason it matters for this
 * member. Every technical term in the factor AND the reason renders bold and
 * tappable into the glossary explainer (see CLAUDE.md — standing standard).
 */
export default function ScoreReasons({
  reasons,
  className,
  heading,
}: {
  reasons: ScoreReason[];
  className?: string;
  /** Pass a heading to render the ranked-callout treatment with its label. */
  heading?: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <div className={cn("mt-3", className)}>
      {heading && (
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50 font-body">
          {heading}
        </p>
      )}
      <ul className="space-y-1.5">
        {reasons.map((r, i) => {
          const isPlus = r.direction === "plus";
          const neutral = !isPlus && isFrequencyReason(r);
          const Icon = neutral ? Info : isPlus ? Check : AlertTriangle;
          return (
            <li
              key={`${r.direction}-${i}`}
              className="flex items-start gap-2.5 rounded-[12px] border border-border/50 bg-white/60 px-2.5 py-2"
            >
              <span
                className={cn(
                  "mt-[1px] flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold tabular-nums",
                  isPlus
                    ? "bg-good/15 text-good"
                    : neutral
                      ? "bg-muted text-foreground/60"
                      : "bg-destructive/12 text-destructive",
                )}
                aria-label={`Rank ${i + 1} — ${
                  isPlus ? "earned points" : neutral ? "something to know" : "cost points"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="wrap-words flex items-start gap-1.5 text-[13px] leading-snug">
                  <Icon
                    className={cn(
                      "mt-[3px] size-3 shrink-0",
                      isPlus ? "text-good" : neutral ? "text-foreground/50" : "text-destructive",
                    )}
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <GlossaryTerm text={r.factor} className="font-semibold" />
                </p>
                <p className="wrap-words mt-0.5 text-[12.5px] leading-[1.5] text-foreground/70">
                  <GlossaryRichText text={r.reason} />
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

