import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

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
    const direction = row.direction === "plus" || row.direction === "minus" ? row.direction : null;
    const factor = typeof row.factor === "string" ? row.factor.trim() : "";
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    if (!direction || !factor || !reason) return [];
    return [{ direction, factor, reason }];
  }).slice(0, 4);
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
        const Icon = isPlus ? Check : AlertTriangle;
        return (
          <li key={`${r.direction}-${i}`} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                isPlus ? "bg-good/15 text-good" : "bg-destructive/12 text-destructive",
              )}
              aria-label={isPlus ? "Earned points" : "Cost points"}
            >
              <Icon className="size-3" strokeWidth={2.5} />
            </span>
            <p className="text-[13px] leading-snug">
              <span className="font-semibold text-foreground">{r.factor}</span>
              <span className="text-foreground/70"> — {r.reason}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
