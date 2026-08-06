import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { anchorProps } from "@/lib/scrollMemory";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * ListRow — the app-wide scannable list item.
 *
 * Anatomy, left to right: leading icon or image → bold name → at most ONE line
 * of secondary text → the key fact as a chip / stat / trend on the right.
 * Nothing wraps past three lines and nothing is ever truncated with an ellipsis
 * on guidance content: keep secondary copy short at the source instead.
 */
const ListRow = ({
  icon: Icon,
  leading,
  name,
  secondary,
  fact,
  factTone = "gold",
  factIcon: FactIcon,
  trailing,
  to,
  onClick,
  tone = "card",
  className,
  anchorId,
}: {
  icon?: LucideIcon;
  /** Image or custom visual used instead of an icon. */
  leading?: ReactNode;
  name: ReactNode;
  /** ONE line maximum. */
  secondary?: ReactNode;
  /** Key fact chip on the right (match score, status, date, %). */
  fact?: ReactNode;
  factTone?: GuidanceTone;
  factIcon?: LucideIcon;
  /** Fully custom right-hand side (overrides `fact`). */
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: "card" | "gold";
  className?: string;
  /** Stable record id — enables scroll restoration back to this row. */
  anchorId?: string | number;
}) => {
  const navigate = useNavigate();
  const interactive = Boolean(to || onClick);
  const ft = TONE_CLASSES[factTone];

  const inner = (
    <div className="flex items-center gap-3">
      {leading ? (
        <div className="shrink-0">{leading}</div>
      ) : Icon ? (
        <span className="shrink-0 inline-flex size-9 items-center justify-center rounded-full bg-primary/12">
          <Icon className="size-4 text-primary" aria-hidden />
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="font-body text-[13.5px] font-semibold leading-tight text-foreground break-words">
          {name}
        </p>
        {secondary && (
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground font-body break-words">
            {secondary}
          </p>
        )}
      </div>

      {trailing ??
        (fact ? (
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[10.5px] font-semibold font-body",
              ft.chip,
              ft.label,
            )}
          >
            {FactIcon && <FactIcon className="size-3" aria-hidden />}
            {fact}
          </span>
        ) : null)}

      {interactive && !trailing && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );

  const shell = cn(
    "w-full min-h-[56px] rounded-[14px] border p-3 text-left transition",
    tone === "gold" ? "bg-primary/[0.07] border-primary/25" : "bg-card border-border",
    interactive && "hover:bg-primary/[0.05] active:scale-[0.995]",
    className,
  );

  if (!interactive) return <div className={shell}>{inner}</div>;
  return (
    <button type="button" {...anchorProps(anchorId)} onClick={() => (onClick ? onClick() : navigate(to!))} className={shell}>
      {inner}
    </button>
  );
};

export default ListRow;
