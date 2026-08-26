import { useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import HeatToolPicker from "@/components/HeatToolPicker";
import StatusCallout from "@/components/guidance/StatusCallout";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import ActionList from "@/components/guidance/ActionList";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import { emphasisSplit } from "@/lib/tipsRender";

/**
 * The answer to one step's heat question.
 *
 * - "yes"       — heat was used on THIS step
 * - "no"        — heat was not used on this step at all
 * - "elsewhere" — she used heat, but on her treatment step, not this one. Counts
 *                 as NO heat here; the treatment step carries the real answer.
 */
export type HeatChoice = "yes" | "no" | "elsewhere" | null;


export interface HeatRationale {
  headline: string;
  reasons: string[];
}

/**
 * HeatStepEditor — the "did you use a heat treatment?" flow for ONE wash step.
 *
 * Extracted from the Condition step so the Treatment / Mask step can reuse the
 * exact same question, tool picker, duration input and styling. Each instance
 * holds its own answer, so heat on the conditioner and heat on the treatment
 * are fully independent. The personalised "why heat could help" rationale is
 * owned by the page and shared across instances (one fetch, not one per step).
 */
const HeatStepEditor = ({
  stepLabel,
  choice,
  onYes,
  onNo,
  minutes,
  onMinutes,
  toolIds,
  onToggleTool,
  rationale,
  rationaleLoading,
  onRequestRationale,
  onOpenWhyDialog,
  whyDialogOpen,
  level,
  onElsewhere,
}: {
  /** Display label of the step this heat answer belongs to. */
  stepLabel: string;
  choice: HeatChoice;
  onYes: () => void;
  onNo: () => void;
  minutes: number | null;
  onMinutes: (m: number | null) => void;
  toolIds: string[];
  onToggleTool: (id: string) => void;
  rationale: HeatRationale | null;
  rationaleLoading: boolean;
  onRequestRationale: () => void;
  onOpenWhyDialog: () => void;
  whyDialogOpen: boolean;
  level: number;
  /**
   * Only passed on the Condition step. "I used it for my treatment instead":
   * records no heat here and hands the answer to the treatment step, so the
   * same heat is never entered twice or logged against the wrong step.
   */
  onElsewhere?: () => void;
}) => {
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div className="px-3 py-2.5 bg-primary/5 border border-primary/30 rounded-[10px] space-y-2">
      <div className="flex items-center gap-2">
        <Flame className="size-4 text-primary" />
        <span className="text-xs font-medium flex-1">Did you use a heat treatment?</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onYes}
          aria-pressed={choice === "yes"}
          className={cn(
            "flex-1 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors min-h-[36px]",
            choice === "yes"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border",
          )}
        >
          Yes ✓
        </button>
        <button
          type="button"
          onClick={onNo}
          aria-pressed={choice === "no"}
          className={cn(
            "flex-1 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors min-h-[36px]",
            choice === "no"
              ? "bg-muted text-foreground border-border"
              : "bg-card text-muted-foreground border-border",
          )}
        >
          No
        </button>
      </div>
      {onElsewhere && (
        <button
          type="button"
          onClick={onElsewhere}
          aria-pressed={choice === "elsewhere"}
          className={cn(
            "w-full px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors min-h-[36px]",
            choice === "elsewhere"
              ? "bg-muted text-foreground border-border"
              : "bg-card text-muted-foreground border-border",
          )}
        >
          Not here — I used it for my treatment
        </button>
      )}
      {choice === "elsewhere" && (
        <p className="text-[11px] text-muted-foreground">
          Nothing logged against {stepLabel}. Your heat question on the Treatment / Mask step is
          already answered <strong>yes</strong> — add the tool and how long there.
        </p>
      )}

      {choice === "yes" && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-medium text-foreground">How long for?</p>
          <div className="flex flex-wrap gap-1.5">
            {[15, 20, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMinutes(m)}
                aria-pressed={minutes === m}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-medium border transition-colors min-h-[32px]",
                  minutes === m
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border",
                )}
              >
                {m} min
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              placeholder="Custom"
              value={minutes && ![15, 20, 30, 45, 60].includes(minutes) ? minutes : ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                onMinutes(Number.isFinite(v) && v > 0 ? v : null);
              }}
              className="w-20 px-2.5 py-1 rounded-full text-[11px] bg-card border border-border min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-center"
            />
          </div>
          {minutes && (
            <p className="text-[11px] text-muted-foreground">
              ✓ Logged: {minutes} minutes. Tap <strong>Done</strong> on the {stepLabel} step to save.
            </p>
          )}
          <HeatToolPicker selectedIds={toolIds} onToggle={onToggleTool} />
        </div>
      )}
      {choice === "no" && !whyDialogOpen && (
        <button
          type="button"
          onClick={onOpenWhyDialog}
          className="text-[11px] text-primary underline underline-offset-2"
        >
          Why heat could help your hair →
        </button>
      )}

      {/* Quick education before deciding — compact disclosure at levels
          1-2 (StatusCallout), full anatomy always-visible at 3-4 (no
          accordion once the depth of level 3-4 calls for it). */}
      <div className="border-t border-primary/20 pt-2">
        <button
          type="button"
          onClick={() => {
            const next = !whyOpen;
            setWhyOpen(next);
            if (next && !rationale && !rationaleLoading) onRequestRationale();
          }}
          className="py-1 text-[11px] font-medium text-primary"
        >
          {whyOpen ? "Hide why heat could help" : "Why do a heat treatment?"}
        </button>
        {whyOpen && (
          rationaleLoading && !rationale ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
              <Loader2 className="size-3 animate-spin" /> Personalising…
            </div>
          ) : rationale ? (
            level <= 2 ? (
              <StatusCallout
                tone="gold"
                icon={Flame}
                label="Heat treatment"
                chips={<KeyFactChips text={rationale.reasons.join(" ")} max={1} />}
                className="mt-2"
              >
                {rationale.headline}
              </StatusCallout>
            ) : (
              <GuidanceCard
                eyebrow="Heat treatment"
                icon={Flame}
                headline={rationale.headline}
                compact
                className="mt-2"
              >
                {rationale.reasons[0] && (() => {
                  const { phrase, rest } = emphasisSplit(rationale.reasons[0]);
                  return (
                    <p className="text-[12.5px] leading-relaxed">
                      <span className="font-semibold text-foreground">{phrase}</span>{" "}
                      <span className="text-foreground/75">{rest}</span>
                    </p>
                  );
                })()}
                {rationale.reasons.length > 1 && (
                  <ActionList
                    actions={rationale.reasons.slice(1).map((r) => ({ action: r }))}
                    showWhy={false}
                    idPrefix="heat-reason"
                  />
                )}
              </GuidanceCard>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground py-2">
              Gentle heat lifts the cuticle so deep conditioner absorbs further — useful for length retention, dryness, or coarser strands.
            </p>
          )
        )}
      </div>
    </div>
  );
};

export default HeatStepEditor;
