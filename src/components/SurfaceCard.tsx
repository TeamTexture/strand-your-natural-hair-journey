import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Props = HTMLAttributes<HTMLDivElement> & {
  /** card | gold-tint | dark-alert | green-tint | orange-tint */
  tone?: "card" | "gold" | "dark" | "green" | "orange";
  padded?: boolean;
};

/**
 * Strand surface card. Default is warm-white #FDF8F2 with cream border.
 */
const SurfaceCard = forwardRef<HTMLDivElement, Props>(
  ({ tone = "card", padded = true, className, children, ...rest }, ref) => {
    const toneClass = {
      card: "bg-card border-border text-foreground",
      gold: "bg-primary/10 border-primary/30 text-foreground",
      dark: "bg-alert-dark border-primary/40 text-alert-dark-foreground",
      green: "bg-good/10 border-good/30 text-foreground",
      orange: "bg-warn/10 border-warn/30 text-foreground",
    }[tone];
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[14px] border",
          toneClass,
          padded && "p-4",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
SurfaceCard.displayName = "SurfaceCard";

export default SurfaceCard;
