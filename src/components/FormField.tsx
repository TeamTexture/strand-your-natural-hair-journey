import { Check } from "lucide-react";
import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Show right-aligned tick if input has a value */
  showTick?: boolean;
  /** Custom right-side adornment (e.g. badge) */
  rightAdornment?: ReactNode;
  /** Helper text below */
  helper?: string;
}

const FormField = forwardRef<HTMLInputElement, Props>(
  ({ label, showTick = true, rightAdornment, helper, value, className, ...rest }, ref) => {
    const hasValue = typeof value === "string" ? value.trim().length > 0 : Boolean(value);
    return (
      <label className="block">
        <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
          {label}
        </span>
        <div
          className={cn(
            "relative flex items-center bg-card rounded-[10px] border transition-colors",
            hasValue ? "border-primary/60" : "border-border",
          )}
        >
          <input
            ref={ref}
            value={value}
            className={cn(
              "w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px]",
              className,
            )}
            {...rest}
          />
          <div className="pr-3 flex items-center gap-2 shrink-0">
            {rightAdornment}
            {showTick && hasValue && !rightAdornment && (
              <Check className="size-4 text-good" />
            )}
          </div>
        </div>
        {helper && (
          <p className="mt-1 text-[11px] text-muted-foreground font-body">{helper}</p>
        )}
      </label>
    );
  },
);
FormField.displayName = "FormField";

export default FormField;
