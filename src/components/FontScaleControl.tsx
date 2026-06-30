import { useEffect, useState } from "react";
import { Type } from "lucide-react";
import {
  FONT_SCALE_OPTIONS,
  type FontScaleKey,
  getFontScale,
  setFontScale,
} from "@/lib/fontScale";
import { cn } from "@/lib/utils";

/** Segmented control to change global text size. Persists to localStorage
 *  and applies immediately on click. */
const FontScaleControl = () => {
  const [scale, setScale] = useState<FontScaleKey>("M");

  useEffect(() => {
    setScale(getFontScale());
  }, []);

  const handle = (key: FontScaleKey) => {
    setScale(key);
    setFontScale(key);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Type className="size-3" />
        Text size
      </div>
      <div
        role="radiogroup"
        aria-label="Text size"
        className="grid grid-cols-4 gap-1 rounded-pill border border-border bg-card p-1"
      >
        {FONT_SCALE_OPTIONS.map((opt) => {
          const active = opt.key === scale;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handle(opt.key)}
              className={cn(
                "rounded-pill py-1.5 font-body transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary",
              )}
              style={{ fontSize: `${opt.px * 0.75}px` }}
            >
              {opt.key}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground font-body">
        Affects text across the whole app.
      </p>
    </div>
  );
};

export default FontScaleControl;
