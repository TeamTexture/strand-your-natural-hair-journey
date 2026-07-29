import { TIPS_LEVEL_HINT, TIPS_LEVEL_LABEL, type TipsLevel } from "@/lib/tipsLevel";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { cn } from "@/lib/utils";

const OPTIONS: TipsLevel[] = ["essential", "detailed"];

/** Settings control for the tips density preference. */
const TipsLevelControl = () => {
  const { level, setLevel } = useTipsLevel();

  return (
    <div>
      <p className="text-[13px] font-semibold leading-tight">Tips level</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
        How much guidance you see on wash day, your dashboard, and product summaries.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setLevel(opt)}
            className={cn(
              "p-3 rounded-[10px] border text-left transition-colors",
              level === opt
                ? "border-primary bg-primary/8"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <span className="block text-[12px] font-semibold">
              {TIPS_LEVEL_LABEL[opt]}
              {opt === "detailed" && (
                <span className="font-normal text-muted-foreground"> (hand-holding)</span>
              )}
            </span>
            <span className="block text-[10px] text-muted-foreground mt-1 leading-snug">
              {TIPS_LEVEL_HINT[opt]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TipsLevelControl;
