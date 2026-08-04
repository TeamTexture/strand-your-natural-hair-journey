import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ChoiceChips — icon-led selection tiles used instead of dropdowns or plain
 * text lists wherever there are eight options or fewer. Every option is visible
 * at a glance, and each target is at least 44px tall.
 */
export interface Choice {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Optional short helper line (level 3–4 flows). */
  hint?: string;
}

const ChoiceChips = ({
  options,
  value,
  onChange,
  multiple = false,
  columns = 2,
  className,
  compact = false,
}: {
  options: Choice[];
  /** Selected value(s). */
  value: string | string[] | null | undefined;
  onChange: (next: string) => void;
  multiple?: boolean;
  columns?: 1 | 2 | 3;
  className?: string;
  /** Tighter chips for short single-word labels in narrow columns. */
  compact?: boolean;
}) => {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-3" : "grid-cols-2",
        className,
      )}
      role={multiple ? "group" : "radiogroup"}
    >
      {options.map((o) => {
        const on = selected.includes(o.value);
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[44px] rounded-[12px] border py-2.5 transition flex items-start gap-2",
              compact
                ? "px-1.5 text-center justify-center items-center"
                : "px-3 text-left",
              on
                ? "bg-primary/15 border-primary text-foreground"
                : "bg-card border-border text-foreground/85 hover:bg-primary/[0.06]",
            )}
          >
            {Icon && (
              <Icon className={cn("size-4 shrink-0 mt-[1px]", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  "block font-body font-semibold leading-tight",
                  // Short labels must never split mid-word onto a second row.
                  compact ? "text-[11px] whitespace-nowrap" : "text-[12.5px] break-words",
                )}
              >
                {o.label}
              </span>
              {o.hint && (
                <span className="block mt-0.5 font-body text-[10.5px] leading-snug text-muted-foreground break-words">
                  {o.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ChoiceChips;
