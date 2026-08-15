import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * StatusCallout — a compact tinted callout built only on existing tokens.
 *
 * gold = tip · insight = neutral insight · warning = overdue/caution ·
 * muted = context · good = confirmation.
 *
 * At level 1 this is the whole guidance surface: icon + one action line + one
 * key chip.
 */
const StatusCallout = ({
  tone = "gold",
  icon: Icon,
  label,
  children,
  chips,
  action,
  className,
}: {
  tone?: GuidanceTone;
  icon?: LucideIcon;
  label?: string;
  children?: ReactNode;
  chips?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => {
  const t = TONE_CLASSES[tone];
  return (
    <div className={cn("rounded-[12px] border p-3 flex gap-3", t.box, className)}>
      {Icon && (
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full border", t.chip)}>
          <Icon className={cn("size-4", t.icon)} aria-hidden />
        </span>
      )}
      <div className="flex-1 min-w-0">
        {label && (
          <p className={cn("text-[9.5px] uppercase tracking-[0.2em] font-bold font-body", t.label)}>
            {label}
          </p>
        )}
        {children && (
          <div className={cn("text-[13px] leading-[1.6] text-foreground/90 font-body break-words [overflow-wrap:anywhere]", label && "mt-1")}>
            {children}
          </div>
        )}
        {chips && <div className="mt-2">{chips}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
};

export default StatusCallout;
