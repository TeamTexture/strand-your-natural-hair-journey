import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Style variants */
  tone?: "default" | "warn";
  /**
   * Optional clinical shorthand shown in brackets after the option text, so a
   * member learns what her plain-English answer actually means. Presentation
   * only — the stored/compared value is always the option text itself, never
   * this annotation.
   */
  annotation?: string;
}

/**
 * Pill-shaped multi-select tag. Tap toggles gold fill.
 */
const Tag = ({ selected, tone = "default", annotation, className, children, ...rest }: Props) => (
  <button
    type="button"
    aria-pressed={selected}
    className={cn(
      "px-3.5 py-2 rounded-full text-xs font-body border transition-colors leading-snug text-left max-w-full whitespace-normal [overflow-wrap:anywhere]",
      selected
        ? "bg-primary text-primary-foreground border-primary font-medium"
        : "bg-surface-raised text-foreground border-border hover:border-primary/50",
      tone === "warn" && !selected && "text-warn",
      className,
    )}
    {...rest}
  >
    {children}
    {annotation && (
      <span
        className={cn(
          "ml-1 font-normal",
          selected ? "text-primary-foreground/75" : "text-gold-deep",
        )}
      >
        ({annotation})
      </span>
    )}
  </button>
);

export default Tag;
