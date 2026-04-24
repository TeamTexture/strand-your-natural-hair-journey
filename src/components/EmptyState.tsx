import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import SurfaceCard from "./SurfaceCard";

interface Props {
  /** Large emoji or icon shown above the message. */
  icon?: ReactNode;
  /** Headline message. Plain text. */
  message: string;
  /** Optional secondary line (e.g. "Tap below to log your first."). */
  hint?: string;
  /** Optional CTA — usually a Button. Rendered below the message. */
  action?: ReactNode;
  /** Use the gold-tinted card variant (recommended for primary surfaces). */
  tone?: "card" | "gold";
  className?: string;
}

/**
 * Reusable empty-state card. Use whenever a list, shelf, or board has no
 * data yet so the user always sees something intentional — never a blank screen.
 */
const EmptyState = ({ icon, message, hint, action, tone = "gold", className }: Props) => (
  <SurfaceCard tone={tone} className={cn("text-center space-y-2 py-6", className)}>
    {icon && <div className="text-4xl leading-none mb-1">{icon}</div>}
    <p className="font-display text-[16px] leading-snug text-foreground">{message}</p>
    {hint && (
      <p className="font-script italic text-[14px] text-muted-foreground leading-snug">{hint}</p>
    )}
    {action && <div className="pt-2">{action}</div>}
  </SurfaceCard>
);

export default EmptyState;
