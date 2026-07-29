import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  MARKETED_PURPOSES,
  MARKETED_PURPOSE_LABEL,
  MARKETED_PURPOSE_SURFACTANT_NOTE,
  type MarketedPurpose,
} from "@/lib/marketedPurpose";
import { cn } from "@/lib/utils";

interface Props {
  value: MarketedPurpose | null;
  onChange: (value: MarketedPurpose) => void;
  /** Read-only rendering (no picker) — used where the user can't edit. */
  readOnly?: boolean;
  className?: string;
}

/**
 * Simple selector for the hair need a product is marketed for. Shown on the
 * product detail screen so the user can confirm or correct what the scan
 * inferred — the value feeds the AI's surfactant-strength reasoning.
 */
const MarketedPurposeSelector = ({ value, onChange, readOnly, className }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("", className)}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
        Marketed for
      </p>

      {readOnly ? (
        <p className="text-sm font-medium">
          {value ? MARKETED_PURPOSE_LABEL[value] : "Not set"}
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 p-3 rounded-[10px] border border-border bg-background text-left"
          >
            <span className={cn("text-sm", !value && "text-muted-foreground")}>
              {value ? MARKETED_PURPOSE_LABEL[value] : "Choose what it's sold for"}
            </span>
            <ChevronDown
              className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </button>

          {open && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {MARKETED_PURPOSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-2 rounded-[10px] border text-[11px] font-medium text-left",
                    value === p
                      ? "border-primary bg-primary/8 text-primary"
                      : "border-border bg-background text-foreground/80",
                  )}
                >
                  {value === p && <Check className="size-3 shrink-0" />}
                  <span className="truncate">{MARKETED_PURPOSE_LABEL[p]}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {value && (
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
          {MARKETED_PURPOSE_SURFACTANT_NOTE[value]}
        </p>
      )}
    </div>
  );
};

export default MarketedPurposeSelector;
