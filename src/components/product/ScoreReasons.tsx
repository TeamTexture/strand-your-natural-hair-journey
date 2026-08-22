import { Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlossaryTerm } from "@/components/ingredients/IngredientToken";

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

/**
 * "Show your working" rows under the score hero: what earned points and what
 * cost them, each tied to one of this user's own signals.
 */
export default function ScoreReasons({
  reasons,
  className,
}: {
  reasons: ScoreReason[];
  className?: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <ul className={cn("mt-3 space-y-2", className)}>
      {reasons.map((r, i) => {
        const isPlus = r.direction === "plus";
        const neutral = !isPlus && isFrequencyReason(r);
        const Icon = neutral ? Info : isPlus ? Check : AlertTriangle;
        return (
          <li key={`${r.direction}-${i}`} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                isPlus
                  ? "bg-good/15 text-good"
                  : neutral
                    ? "bg-muted text-foreground/60"
                    : "bg-destructive/12 text-destructive",
              )}
              aria-label={isPlus ? "Earned points" : neutral ? "Something to know" : "Cost points"}
            >
              <Icon className="size-3" strokeWidth={2.5} />
            </span>
            <p className="text-[13px] leading-snug">
              <GlossaryTerm text={r.factor} className="font-semibold" />
              <span className="text-foreground/70"> — {r.reason}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
