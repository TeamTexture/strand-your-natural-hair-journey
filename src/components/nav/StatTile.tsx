import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * StatTile — an anchored stat that doubles as navigation.
 *
 * Same anatomy as the guidance-card hero stat: icon + ONE large sans-serif
 * numeral (with its unit) + a small muted label. Nothing here requires reading
 * a sentence to learn the number. Severity tone carries the app-wide meaning:
 * destructive/warning = needs action, gold = attention/tip, good = on track.
 */
export interface StatTileProps {
  icon: LucideIcon;
  /** The number (with unit if short, e.g. "13" or "72%"). */
  value: ReactNode;
  /** Optional override for the value type scale (e.g. a wrapping text label). */
  valueClassName?: string;
  /** Small caps eyebrow above the stat. */
  label: string;
  /** One short line under the stat. Never a paragraph. */
  sub?: string;
  tone?: GuidanceTone;
  to?: string;
  onClick?: () => void;
  className?: string;
}

const StatTile = ({
  icon: Icon,
  value,
  valueClassName,
  label,
  sub,
  tone = "gold",
  to,
  onClick,
  className,
}: StatTileProps) => {
  const navigate = useNavigate();
  const t = TONE_CLASSES[tone];
  const interactive = Boolean(to || onClick);

  const body = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className={cn("inline-flex size-7 items-center justify-center rounded-full border", t.chip)}>
          <Icon className={cn("size-3.5", t.icon)} aria-hidden />
        </span>
        {interactive && <ChevronRight className="size-3.5 text-muted-foreground/70" aria-hidden />}
      </div>
      <p className={cn("mt-2 font-body text-[28px] font-semibold leading-none tracking-tight text-foreground break-words [overflow-wrap:anywhere]", valueClassName)}>
        {value}
      </p>
      <p className="mt-1.5 text-[9.5px] uppercase tracking-[0.16em] font-bold font-body text-muted-foreground break-words">
        {label}
      </p>
      {sub && (
        <p className={cn("mt-0.5 text-[11px] leading-snug font-body break-words", t.label)}>{sub}</p>
      )}
    </>
  );

  const shell = cn(
    "block w-full min-h-[44px] rounded-[14px] border p-3 text-left transition",
    t.box,
    interactive && "hover:opacity-95 active:scale-[0.99]",
    className,
  );

  if (!interactive) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => (onClick ? onClick() : navigate(to!))}
      className={shell}
      aria-label={`${label}: ${typeof value === "string" || typeof value === "number" ? value : ""}`}
    >
      {body}
    </button>
  );
};

export default StatTile;
