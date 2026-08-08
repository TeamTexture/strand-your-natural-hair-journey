import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import {
  TIPS_LEVELS,
  TIPS_LEVEL_HINT,
  TIPS_LEVEL_LABEL,
  coerceTipsLevel,
  type TipsLevel,
} from "@/lib/tipsLevel";
import { cn } from "@/lib/utils";

const TOOLTIP_SEEN_KEY = "strand.tipsLevelHeaderTipSeen";

/** Four ascending bars, filled up to the current level. */
const LevelBars = ({ level }: { level: TipsLevel }) => (
  <span className="flex items-end gap-[2px] h-3.5" aria-hidden>
    {TIPS_LEVELS.map((l) => (
      <span
        key={l}
        className={cn(
          "w-[3px] rounded-[1px] transition-colors",
          l <= level ? "bg-primary" : "bg-primary/25",
        )}
        style={{ height: `${4 + l * 2.5}px` }}
      />
    ))}
  </span>
);

/**
 * Persistent header control for the tips support level (1–4).
 * Collapsed: a compact chip with signal bars + the level name.
 * Expanded: a bottom sheet with a draggable slider. Changes apply live
 * everywhere via the shared `useTipsLevel` store.
 */
const TipsLevelButton = ({ className }: { className?: string }) => {
  const { level, setLevel } = useTipsLevel();
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(TOOLTIP_SEEN_KEY) !== "1") setShowTooltip(true);
    } catch { /* private mode */ }
  }, []);

  const dismissTooltip = () => {
    setShowTooltip(false);
    try { localStorage.setItem(TOOLTIP_SEEN_KEY, "1"); } catch { /* private mode */ }
  };

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => { dismissTooltip(); setOpen(true); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          aria-label={`Guidance level: ${TIPS_LEVEL_LABEL[level]}. Tap to change.`}
          className="size-8 shrink-0 inline-flex items-center justify-center rounded-pill border border-border bg-card text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
        >
          <LevelBars level={level} />
        </button>

        {hovered && !showTooltip && (
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-40 whitespace-nowrap rounded-[10px] bg-foreground text-background px-2.5 py-1.5 shadow-lg animate-in fade-in-0 zoom-in-95"
          >
            <span className="absolute -top-1 right-3 size-2 rotate-45 bg-foreground" />
            <span className="block text-[11px] leading-snug">
              Guidance: {TIPS_LEVEL_LABEL[level]}
            </span>
          </span>
        )}

        {showTooltip && (
          <button
            type="button"
            onClick={dismissTooltip}
            className="absolute right-0 top-[calc(100%+8px)] z-40 w-[190px] rounded-[10px] bg-foreground text-background px-3 py-2 text-left shadow-lg animate-in fade-in-0 zoom-in-95"
          >
            <span className="absolute -top-1 right-6 size-2 rotate-45 bg-foreground" />
            <span className="block text-[11px] leading-snug">
              Drag to get more or less guidance, anytime.
            </span>
          </button>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-5 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-xl">How much guidance?</SheetTitle>
          </SheetHeader>
          <p className="text-[12px] text-muted-foreground leading-snug mt-1">
            This controls how many tips you see and how fully they're explained,
            everywhere in the app.
          </p>

          <div className="mt-5">
            <p className="text-[13px] font-semibold">{TIPS_LEVEL_LABEL[level]}</p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 min-h-[30px]">
              {TIPS_LEVEL_HINT[level]}
            </p>

            <Slider
              className="mt-3 touch-none"
              value={[level]}
              min={1}
              max={3}
              step={1}
              onValueChange={(v) => setLevel(coerceTipsLevel(v[0]))}
              aria-label="Guidance level"
            />

            <div className="flex justify-between mt-2">
              {TIPS_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={cn(
                    "text-[9.5px] leading-tight w-1/3 transition-colors",
                    l === 1 ? "text-left" : l === 3 ? "text-right" : "text-center",
                    l === level ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  {TIPS_LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default TipsLevelButton;
