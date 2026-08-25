import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Section number within the screen, e.g. 1 → "01". */
  number: number;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * A warm white card that groups related onboarding questions together, so a
 * screen reads as a few short sections rather than a long flat form.
 *
 * Presentation only — it never changes what is asked or how it is saved.
 */
const OnboardingSectionCard = ({ number, title, children, className }: Props) => (
  <div
    className={cn(
      "rounded-[14px] border border-border bg-card p-4 min-w-0",
      className,
    )}
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="size-[26px] shrink-0 rounded-full bg-primary text-primary-foreground font-body text-[11px] font-semibold flex items-center justify-center">
        {String(number).padStart(2, "0")}
      </span>
      <h2 className="font-display text-[17px] font-bold leading-tight text-foreground min-w-0">
        {title}
      </h2>
    </div>
    <div className="mt-3 mb-4 h-px bg-gradient-to-r from-primary to-transparent" />
    {children}
  </div>
);

export default OnboardingSectionCard;
