import { useNavigate } from "react-router-dom";
import { ChevronRight, Minus, NotebookPen } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useCheckinReminder } from "@/hooks/useCheckinReminder";
import { alertAnchorId, ALERT_KEYS } from "@/lib/alertKeys";

/**
 * The check-in nudge on Home.
 *
 * Persistent but never trapping: she can minimise it (a display choice, per
 * cycle) or skip it outright (permanent for that cycle only). Missed cycles are
 * still offered without a word of blame — the copy stays neutral.
 */
const CheckinReminderBanner = () => {
  const navigate = useNavigate();
  const { open, skip, minimised, setMinimised } = useCheckinReminder();

  if (!open) return null;

  const dayOne = !!open.cycle.isDayOne;
  const title = dayOne
    ? "Where you're starting from"
    : open.cycle.startWeek === open.cycle.closingWeek
      ? `Week ${open.cycle.closingWeek} check-in`
      : `Weeks ${open.cycle.startWeek}–${open.cycle.closingWeek} check-in`;

  if (minimised) {
    return (
      <button
        id={alertAnchorId(ALERT_KEYS.TREATMENT_CHECKIN)}
        onClick={() => navigate(open.path)}
        className="w-full flex items-center gap-2 rounded-pill border border-primary/30 bg-primary/5 px-3 min-h-[40px] text-left"
      >
        <NotebookPen className="size-3.5 text-primary shrink-0" />
        <span className="font-body text-[12px] min-w-0 flex-1 truncate">{title}</span>
        <ChevronRight className="size-3.5 text-primary shrink-0" />
      </button>
    );
  }

  return (
    <SurfaceCard id={alertAnchorId(ALERT_KEYS.TREATMENT_CHECKIN)} className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
          {open.planTitle}
        </p>
        <button
          onClick={() => setMinimised(true)}
          aria-label="Minimise this reminder"
          className="shrink-0 -mt-1 -mr-1 size-8 flex items-center justify-center text-muted-foreground"
        >
          <Minus className="size-4" />
        </button>
      </div>

      <div className="min-w-0">
        <h3 className="font-display text-[17px] leading-tight break-words">{title}</h3>
        <p className="font-body text-[13px] text-muted-foreground leading-snug mt-1">
          {dayOne
            ? "A few words on your hair today gives you something to measure against later."
            : open.state === "missed"
              ? "Still open whenever you have a minute."
              : "Two minutes on how it's going keeps the picture accurate."}
        </p>
      </div>

      <Button className="w-full rounded-pill" onClick={() => navigate(open.path)}>
        {dayOne ? "Write my starting point" : "Do my check-in"}
      </Button>
      <button
        onClick={skip}
        className="w-full font-body text-[12.5px] text-muted-foreground min-h-[36px]"
      >
        Skip this one
      </button>
    </SurfaceCard>
  );
};

export default CheckinReminderBanner;
