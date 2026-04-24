import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/**
 * Multi-select dropdown — shows selected values as gold chips below.
 * Used for hairstyle pickers on ProfileStep4Colour.
 */
const MultiSelectDropdown = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Select one or more…",
}: Props) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  const remove = (opt: string) => onChange(value.filter((v) => v !== opt));

  return (
    <div className="space-y-2">
      <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
        {label}
      </span>

      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "w-full flex items-center justify-between px-3.5 py-3 bg-card rounded-[10px] border text-sm text-left transition-colors min-h-[44px]",
            value.length > 0 ? "border-primary/60" : "border-border",
          )}
        >
          <span
            className={cn(
              "truncate",
              value.length === 0 && "text-muted-foreground/60",
            )}
          >
            {value.length === 0
              ? placeholder
              : value.length === 1
                ? value[0]
                : `${value.length} selected`}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform shrink-0 ml-2",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div className="absolute z-20 left-0 right-0 mt-1.5 bg-card border border-border rounded-[10px] shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {options.map((opt) => {
              const selected = value.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-primary/10 transition-colors flex items-center justify-between gap-2 min-h-[44px]"
                >
                  <span className="text-sm font-body text-foreground">{opt}</span>
                  {selected && <Check className="size-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body bg-primary text-primary-foreground border border-primary"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Remove ${v}`}
                className="size-5 rounded-full flex items-center justify-center hover:bg-primary-foreground/20 -mr-1"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
