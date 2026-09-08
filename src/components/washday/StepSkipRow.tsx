// The "Skip" / "Skipped" affordance shown on optional wash-day steps.
//
// ONLY Pre-poo and Mask are skippable (see SKIPPABLE_STEPS in washLogSteps).
// Cleanse and Condition never render this — they stay set-or-unset.

import { Minus } from "lucide-react";

interface Props {
  /** Member-facing step name, used for the accessible labels. */
  label: string;
  skipped: boolean;
  /** Wording differs between a live log entry and a saved default. */
  skippedLabel: string;
  onSkip: () => void;
  onUndo: () => void;
}

const StepSkipRow = ({ label, skipped, skippedLabel, onSkip, onUndo }: Props) =>
  skipped ? (
    <div className="mt-2 flex items-center gap-2">
      <span className="size-[18px] rounded-full border border-border flex items-center justify-center shrink-0">
        <Minus className="size-3 text-muted-foreground" aria-hidden />
      </span>
      <span className="flex-1 min-w-0 font-body text-[12px] text-muted-foreground">
        {skippedLabel}
      </span>
      <button
        type="button"
        onClick={onUndo}
        aria-label={`Undo skipping ${label}`}
        className="shrink-0 min-h-[36px] px-2 text-[11px] uppercase tracking-[0.12em] text-primary font-medium"
      >
        Undo
      </button>
    </div>
  ) : (
    <div className="mt-1 flex justify-end">
      <button
        type="button"
        onClick={onSkip}
        aria-label={`Skip ${label}`}
        className="min-h-[36px] px-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
      >
        Skip
      </button>
    </div>
  );

export default StepSkipRow;
