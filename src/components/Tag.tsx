import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Style variants */
  tone?: "default" | "warn";
}

/**
 * Pill-shaped multi-select tag. Tap toggles gold fill.
 */
const Tag = ({ selected, tone = "default", className, children, ...rest }: Props) => (
  <button
    type="button"
    aria-pressed={selected}
    className={cn(
      "px-3.5 py-2 rounded-full text-xs font-body border transition-colors leading-none",
      selected
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground border-border hover:border-primary/50",
      tone === "warn" && !selected && "text-warn",
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);

export default Tag;
