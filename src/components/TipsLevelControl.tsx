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

      <div className="mt-3">
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value) as TipsLevel)}
          aria-label="Guidance level"
          className="w-full accent-primary"
        />
        <div className="flex justify-between mt-1.5">
          {TIPS_LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLevel(lv)}
              className={cn(
                "text-[9px] leading-tight w-1/4 text-center transition-colors",
                lv === level ? "text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              {TIPS_LEVEL_LABEL[lv]}
            </button>
          ))}
        </div>
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
