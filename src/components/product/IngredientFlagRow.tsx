import { type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";
import { IngredientToken } from "@/components/ingredients/IngredientToken";

export type IngredientFlagTone = "good" | "warn" | "bad";

const TONE_MAP: Record<IngredientFlagTone, GuidanceTone> = {
  good: "good",
  warn: "gold",
  bad: "warning",
};

const ICON_MAP: Record<IngredientFlagTone, LucideIcon> = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
};

/**
 * IngredientFlagRow — a single flag-coloured ingredient row shared by every
 * product/ingredient surface (ProductProfile, IngredientDetail,
 * IngredientResearch, ProductsByIngredient, ToolAdviceDialog).
 *
 * Beneficial ingredients render "good" (tint + check), caution ingredients
 * render "gold" (tint + warning triangle) and avoid ingredients render
 * "warning"/destructive (tint + X). The ingredient name is always bold; its
 * reason renders as light supporting text underneath.
 */
const IngredientFlagRow = ({
  name,
  reason,
  flag,
  as = "div",
  onClick,
  trailing,
  className,
  explainable = true,
}: {
  name: string;
  reason?: string | null;
  flag: IngredientFlagTone;
  as?: "div" | "button";
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
  /** Set false where the whole row already navigates somewhere else. */
  explainable?: boolean;
}) => {
  const tone = TONE_MAP[flag];
  const t = TONE_CLASSES[tone];
  const Icon = ICON_MAP[flag];
  const El = as;
  return (
    <El
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 rounded-[10px] border p-2.5 min-h-[44px] text-left",
        t.box,
        as === "button" && "active:scale-[0.99] transition",
        className,
      )}
    >
      <span className={cn("mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border", t.chip)}>
        <Icon className={cn("size-3.5", t.icon)} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-foreground break-words font-body">
          {explainable && as !== "button" ? <IngredientToken name={name} label={name} className="font-semibold" /> : name}
        </p>
        {reason && (
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/70 break-words font-body">
            {reason}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0 self-center">{trailing}</div>}
    </El>
  );
};

export default IngredientFlagRow;
