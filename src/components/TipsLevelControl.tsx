import {
  TIPS_LEVELS,
  TIPS_LEVEL_HINT,
  TIPS_LEVEL_LABEL,
  type TipsLevel,
} from "@/lib/tipsLevel";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { cn } from "@/lib/utils";

/** Settings control for the dynamic support scale (1–4). */
const TipsLevelControl = () => {
  const { level, setLevel } = useTipsLevel();

  return (
    <div>
      <p className="text-[13px] font-semibold leading-tight">Guidance level</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
        How much support you see on wash day, your dashboard, product summaries
        and AI guidance.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Guidance level">
        {TIPS_LEVELS.map((lv) => {
          const selected = lv === level;
          return (
            <button
              key={lv}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setLevel(lv)}
              className={cn(
                "min-h-[44px] rounded-[10px] border flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors",
                selected
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              <span className="text-[13px] font-bold font-body leading-none">{lv}</span>
              <span className="text-[9px] uppercase tracking-[0.1em] font-body font-semibold leading-tight text-center">
                {TIPS_LEVEL_LABEL[lv]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-[10px] border border-primary/30 bg-primary/5 p-3">
        <p className="text-[12px] font-semibold">
          Level {level} — {TIPS_LEVEL_LABEL[level]}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
          {TIPS_LEVEL_HINT[level]}
        </p>
      </div>
    </div>
  );
};

export default TipsLevelControl;
