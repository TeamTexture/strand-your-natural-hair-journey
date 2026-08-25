import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** The question itself, in sentence case — read as a question, not a label. */
  children: ReactNode;
  /** The clinical name for what is being asked, shown as a small gold badge. */
  term?: string;
  /** Optional quiet helper line under the question. */
  helper?: string;
  className?: string;
}

/**
 * The label block above a set of tags on an onboarding screen. The question is
 * typeset as a question (sentence case body type), with the clinical term kept
 * separate as a badge so it never reads as part of what she is being asked.
 */
const OnboardingQuestion = ({ children, term, helper, className }: Props) => (
  <div className={cn("mb-[9px]", className)}>
    <p className="font-body text-[14.5px] font-medium leading-[1.3] text-foreground">
      {children}
      {term && (
        <span className="ml-1.5 inline-block align-middle whitespace-nowrap rounded-full bg-primary/[0.16] px-2 py-[3px] font-body text-[9px] font-semibold uppercase tracking-[0.1em] text-gold-deep">
          {term}
        </span>
      )}
    </p>
    {helper && (
      <p className="mt-1.5 border-l-2 border-primary/40 pl-[9px] font-body text-[12px] italic leading-snug text-muted-foreground">
        {helper}
      </p>
    )}
  </div>
);

export default OnboardingQuestion;
