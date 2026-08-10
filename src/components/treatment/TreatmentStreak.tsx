import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreakDay } from "@/lib/treatmentSchedule";

/**
 * STREAK STRIP — the one piece of gamification on the treatment surface.
 *
 * A run of days, drawn as filled beads with the flame count alongside. It
 * rewards consistency without ever scolding: an unlogged day is a quiet empty
 * bead, never red, never a warning.
 */
const TreatmentStreak = ({
  streak,
  days,
  className,
}: {
  streak: number;
  days: StreakDay[];
  className?: string;
}) => {
  if (!days.length) return null;
  const lit = streak > 0;

  return (
    <div
      className={cn(
        "rounded-[16px] border px-3.5 py-3 flex items-center gap-3",
        lit ? "border-primary/40 bg-primary/10" : "border-border bg-card",
        className,
      )}
    >
      <div
        className={cn(
          "size-10 rounded-full flex items-center justify-center shrink-0",
          lit ? "bg-primary/20 text-primary animate-scale-in" : "bg-muted text-muted-foreground",
        )}
      >
        <Flame className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] leading-snug">
          {lit ? `${streak} day${streak === 1 ? "" : "s"} in a row` : "Start your run today"}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {days.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-0.5">
              <span
                aria-hidden
                className={cn(
                  "size-4 rounded-full border transition-transform",
                  d.state === "complete"
                    ? "bg-primary border-primary scale-110"
                    : d.state === "partial"
                      ? "bg-primary/30 border-primary/40"
                      : "bg-transparent border-border",
                  d.isToday && "ring-2 ring-primary/30 ring-offset-1 ring-offset-background",
                )}
              />
              <span className="text-[9px] font-body text-muted-foreground leading-none">
                {d.initial}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TreatmentStreak;
