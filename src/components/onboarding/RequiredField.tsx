import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import OnboardingQuestion from "@/components/onboarding/OnboardingQuestion";

export interface RequiredFieldProps {
  /** Stable id used for the missing-answer list and the scroll target. */
  id: string;
  label: ReactNode;
  answered: boolean;
  invalid: boolean;
  /** Italic helper line (how to check / what to tap if nothing applies). */
  hint?: string;
  /** Clinical term badge beside the question. */
  term?: string;
  /** Quiet definition block under the question. */
  definition?: string;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  children: ReactNode;
}

/**
 * The one required-answer shell used by every onboarding capture screen.
 *
 * It shows a small "Required" label until the question is answered, and after a
 * failed Continue it takes a destructive ring plus a tinted background so the
 * outstanding question is impossible to miss. Presentation only — it never
 * changes what is asked or how it is saved.
 */
const RequiredField = ({
  id,
  label,
  answered,
  invalid,
  hint,
  term,
  definition,
  registerRef,
  children,
}: RequiredFieldProps) => (
  <div
    ref={(el) => registerRef(id, el)}
    className={cn(
      "rounded-[14px] transition-all scroll-mt-24",
      invalid && "ring-2 ring-destructive/70 bg-destructive/5 -mx-2 px-2 py-2",
    )}
  >
    <div className="flex items-baseline justify-between gap-2">
      <OnboardingQuestion
        term={term}
        definition={definition}
        helper={hint}
        className="mb-[9px] min-w-0"
      >
        {label}
      </OnboardingQuestion>
      {!answered && (
        <span
          className={cn(
            "shrink-0 text-[10px] uppercase tracking-[0.14em] font-body",
            invalid ? "text-destructive" : "text-muted-foreground/70",
          )}
        >
          Required
        </span>
      )}
    </div>
    {children}
  </div>
);

export default RequiredField;

/** The persistent list of outstanding questions shown above Continue. */
export const MissingAnswersCard = ({
  missing,
}: {
  missing: { id: string; label: string }[];
}) =>
  missing.length === 0 ? null : (
    <div className="rounded-[14px] border border-border bg-card px-4 py-3">
      <p className="text-[12px] font-body text-foreground">
        {missing.length} question{missing.length === 1 ? "" : "s"} still to answer:
      </p>
      <p className="mt-1 text-[12px] font-body text-muted-foreground leading-snug">
        {missing.map((m) => m.label).join(" · ")}
      </p>
    </div>
  );
