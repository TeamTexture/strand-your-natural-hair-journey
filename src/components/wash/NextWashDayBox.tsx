import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, CalendarClock, Droplets } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { googleCalendarUrl } from "@/lib/addToCalendar";
import { useWashDaySchedules, todayIso, type WashDaySchedule } from "@/hooks/useWashDaySchedules";

interface Props {
  /** Suggested date (YYYY-MM-DD) derived from wash cadence / next wash tip. Editable. */
  suggestedDate?: string | null;
}

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const fmtTime = (t: string | null) => {
  if (!t) return null;
  const [hh, mm] = t.split(":");
  return `${hh}:${mm}`;
};

export const washDayCalendarEvent = (schedule: WashDaySchedule) => ({
  title: "Wash day — STRAND",
  date: schedule.scheduled_date,
  time: schedule.scheduled_time,
  description: "Your STRAND wash day. Open the app to log it when you're done.",
  uid: `wash-day-${schedule.id}@strand.app`,
});

const openedKey = (id: string) => `strand.washSchedule.gcalOpened.${id}`;
const promptedKey = (id: string) => `strand.washSchedule.gcalPrompted.${id}`;

/**
 * Next wash day box. Scheduling in STRAND is mandatory, so this box has no
 * dismiss control — it stays until a STRAND schedule exists AND the Google
 * Calendar question has an answer (confirmed or declined). It never blocks the
 * rest of the app: it is an inline card, not a modal.
 */
const NextWashDayBox = ({ suggestedDate }: Props) => {
  const { activeSchedule, loading, create, answerCalendar, markCalendarAsked } =
    useWashDaySchedules();

  const [date, setDate] = useState(suggestedDate ?? todayIso());
  const [time, setTime] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current && suggestedDate) setDate(suggestedDate);
  }, [suggestedDate]);

  const needsCalendarStep =
    Boolean(activeSchedule) && activeSchedule!.google_calendar_state === "not_asked";

  // Ask on return to the STRAND tab, but only when the calendar link was
  // actually opened this session, and only once per scheduled wash day.
  useEffect(() => {
    if (!needsCalendarStep || !activeSchedule) return;
    const id = activeSchedule.id;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (sessionStorage.getItem(openedKey(id)) !== "1") return;
      if (sessionStorage.getItem(promptedKey(id)) === "1") return;
      sessionStorage.setItem(promptedKey(id), "1");
      setAskOpen(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [needsCalendarStep, activeSchedule]);

  const calendarHref = useMemo(
    () => (activeSchedule ? googleCalendarUrl(washDayCalendarEvent(activeSchedule)) : "#"),
    [activeSchedule],
  );

  if (loading) return null;
  // Resolved: a STRAND schedule exists and the calendar question is answered.
  if (activeSchedule && activeSchedule.google_calendar_state !== "not_asked") return null;

  const onSchedule = async () => {
    try {
      await create.mutateAsync({ date, time: time || null });
      toast.success("Wash day scheduled in STRAND");
    } catch {
      toast.error("Could not save that date", {
        description: "You may already have a wash day scheduled for it.",
      });
    }
  };

  const answer = async (state: "confirmed" | "declined") => {
    if (!activeSchedule) return;
    setAskOpen(false);
    try {
      await answerCalendar.mutateAsync({ id: activeSchedule.id, state });
    } catch {
      toast.error("Could not save your answer");
    }
  };

  return (
    <>
      <SurfaceCard tone="gold">
        <div className="flex items-start gap-3">
          <div className="shrink-0 size-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Droplets className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold font-body">
              Next wash day
            </p>

            {!activeSchedule ? (
              <>
                <p className="font-body text-[13px] leading-snug text-foreground mt-1">
                  Pick your next wash day in STRAND. This step is required — a Google Calendar
                  entry on its own can't be tracked here.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="font-body text-[11px] text-muted-foreground">
                    Date
                    <input
                      type="date"
                      value={date}
                      min={todayIso()}
                      onChange={(e) => {
                        dirty.current = true;
                        setDate(e.target.value);
                      }}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground font-body"
                    />
                  </label>
                  <label className="font-body text-[11px] text-muted-foreground">
                    Time (optional)
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground font-body"
                    />
                  </label>
                  <Button
                    variant="gold"
                    size="pill"
                    disabled={!date || create.isPending}
                    onClick={onSchedule}
                  >
                    <CalendarClock className="size-4 mr-1.5" />
                    Schedule in STRAND
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-body text-[15px] font-semibold leading-snug text-foreground mt-1 break-words">
                  {fmtLong(activeSchedule.scheduled_date)}
                  {fmtTime(activeSchedule.scheduled_time)
                    ? ` · ${fmtTime(activeSchedule.scheduled_time)}`
                    : ""}
                </p>
                <p className="font-body text-[12.5px] leading-snug text-muted-foreground mt-1">
                  Scheduled in STRAND. Want it in your Google Calendar too?
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <a
                    href={calendarHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      sessionStorage.setItem(openedKey(activeSchedule.id), "1");
                      sessionStorage.removeItem(promptedKey(activeSchedule.id));
                      markCalendarAsked.mutate(activeSchedule.id);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 bg-background text-[12.5px] font-semibold text-primary font-body px-4 py-2.5 hover:bg-primary/5 transition"
                  >
                    <CalendarPlus className="size-4" />
                    Add to Google Calendar
                  </a>
                  <button
                    type="button"
                    onClick={() => answer("declined")}
                    className="w-full text-center text-[12px] text-muted-foreground font-body py-1"
                  >
                    I don't use Google Calendar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </SurfaceCard>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Have you added it to your Google Calendar?
            </DialogTitle>
            <DialogDescription className="font-body text-[13px] leading-snug">
              {activeSchedule ? fmtLong(activeSchedule.scheduled_date) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-1">
            <Button variant="gold" size="pill" onClick={() => answer("confirmed")}>
              Yes
            </Button>
            <button
              type="button"
              onClick={() => answer("declined")}
              className="w-full text-center text-[12.5px] font-semibold text-muted-foreground font-body py-2"
            >
              No
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NextWashDayBox;
