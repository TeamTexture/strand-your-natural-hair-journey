import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

export interface IconChip {
  label: string;
  /** Short value shown under the label, e.g. "High". */
  value?: string;
  icon?: LucideIcon;
  tone?: GuidanceTone;
}

/**
 * IconChipGrid — hair/health characteristics as a scannable icon chip grid
 * rather than lines of prose. Label reads as the trait, value as the answer.
 */
const IconChipGrid = ({
  chips,
  columns = 2,
  className,
}: {
  chips: IconChip[];
  columns?: 2 | 3;
  className?: string;
}) => {
  if (chips.length === 0) return null;
  return (
    <ul className={cn("grid gap-2", columns === 3 ? "grid-cols-3" : "grid-cols-2", className)}>
      {chips.map((c, i) => {
        const t = TONE_CLASSES[c.tone ?? "gold"];
        const Icon = c.icon;
        return (
          <li
            key={`${c.label}-${i}`}
            className={cn("rounded-[12px] border px-2.5 py-2 min-h-[52px]", t.box)}
          >
            <span className="flex items-center gap-1.5">
              {Icon && <Icon className={cn("size-3.5 shrink-0", t.icon)} aria-hidden />}
              <span className="text-[8.5px] uppercase tracking-[0.16em] font-bold font-body text-muted-foreground break-words">
                {c.label}
              </span>
            </span>
            {c.value && (
              <span className="mt-1 block font-body text-[12.5px] font-semibold leading-tight text-foreground break-words">
                {c.value}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default IconChipGrid;
