import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * Eyebrow — the ONE eyebrow-label style used app-wide: small tracked caps in
 * the section colour, optionally with its mapped icon. Never a sentence.
 */
const Eyebrow = ({
  icon: Icon,
  children,
  tone = "gold",
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  tone?: GuidanceTone;
  className?: string;
}) => {
  const t = TONE_CLASSES[tone];
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold font-body",
        t.label,
        className,
      )}
    >
      {Icon && <Icon className={cn("size-3.5", t.icon)} aria-hidden />}
      <span className="break-words">{children}</span>
    </p>
  );
};

export default Eyebrow;
