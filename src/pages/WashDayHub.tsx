import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Droplets, CalendarPlus, CalendarClock, Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWashDays } from "@/hooks/useWashDays";
import { useGoals } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle } from "lucide-react";
import { NextWashTipCard } from "@/components/NextWashTipCard";
import { WashDayCard } from "@/components/WashDayCard";
import { loadClinicalContext, type ClinicalContext } from "@/lib/clinicalContext";


const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface CalProps {
  year: number;
  month: number; // 0-11
  washDates: Set<string>; // YYYY-MM-DD
  washDayIdsByDate: Record<string, string>;
  scheduledDates: Set<string>;
  onPrev: () => void;
  onNext: () => void;
  onPickDate: (iso: string) => void;
  onLogDate: (iso: string) => void;
  onScheduleDate: (iso: string) => void;
}

const pad = (n: number) => n.toString().padStart(2, "0");
const isoFor = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const Calendar = ({ year, month, washDates, washDayIdsByDate, scheduledDates, onPrev, onNext, onPickDate, onLogDate, onScheduleDate }: CalProps) => {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayIso = isoFor(today.getFullYear(), today.getMonth(), today.getDate());

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} aria-label="Previous month" className="size-9 -ml-1 flex items-center justify-center text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-4" />
        </button>
        <p className="font-display text-base">{monthNames[month]} {year}</p>
        <button onClick={onNext} aria-label="Next month" className="size-9 -mr-1 flex items-center justify-center text-muted-foreground hover:text-primary">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground text-center mb-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-xs text-center">
        {cells.map((c, i) => {
          if (c === null) return <span key={i} />;
          const iso = isoFor(year, month, c);
          const isWash = washDates.has(iso);
          const isScheduled = !isWash && scheduledDates.has(iso);
          const isToday = iso === todayIso;
          const wdId = washDayIdsByDate[iso];
          const isPastOrToday = iso <= todayIso;
          const isFuture = iso > todayIso;
          const handleClick = isWash && wdId
            ? () => onPickDate(wdId)
            : isFuture
              ? () => onScheduleDate(iso)
              : isPastOrToday
                ? () => onLogDate(iso)
                : undefined;
          const ariaLabel = isWash
            ? `View wash day on ${iso}`
            : isScheduled
              ? `Scheduled wash day on ${iso} — tap to manage`
              : isFuture
                ? `Schedule a wash day on ${iso}`
                : `Log wash day on ${iso}`;
          return (
            <button
              key={i}
              onClick={handleClick}
              aria-label={ariaLabel}
              className={cn(
                "h-9 flex items-center justify-center rounded-full font-body transition-colors",
                isWash && "bg-primary text-primary-foreground font-medium hover:bg-primary/90 cursor-pointer",
                isScheduled && "bg-[hsl(var(--secondary-foreground))] text-primary font-semibold hover:opacity-90 cursor-pointer",
                isToday && !isWash && !isScheduled && "border border-primary text-primary font-medium rounded-md hover:bg-primary/10",
                !isWash && !isScheduled && !isToday && isPastOrToday && "text-foreground/70 hover:bg-primary/10 cursor-pointer",
                !isWash && !isScheduled && !isToday && isFuture && "text-foreground/60 hover:bg-primary/10 cursor-pointer",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" /> Logged</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[hsl(var(--secondary-foreground))]" /> Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-md border border-primary" /> Today</span>
      </div>
    </SurfaceCard>
  );
};


const fmtDayLong = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

const startCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

interface EducationalNoteInput {
  porosity: string | null;
  density: string | null;
  scalp: string | null;
  goalTitles: string[];
  lastWash: Date | null;
  today: Date;
}

interface EducationalNote {
  headline: string;
  window: string;
  why: string;
  reminder: string;
  nextDateIso: string | null;
}

const buildEducationalNote = ({
  porosity,
  density,
  scalp,
  goalTitles,
  lastWash,
  today,
}: EducationalNoteInput): EducationalNote => {
  // The STRAND wash rhythm is fixed at 7 days across the app — the reasoning
  // is what personalises, not the number.
  const p = (porosity ?? "").toLowerCase();
  const s = (scalp ?? "").toLowerCase();
  const d = (density ?? "").toLowerCase();
  const idealDays = 7;
  const cadenceLabel = "every 7 days";

  // Weave the user's data into a natural sentence rather than concatenating
  // clauses with semicolons. One or two grounded reasons reads better than
  // three copy-pasted ones.
  const reasons: string[] = [];
  if (p.includes("high")) {
    reasons.push(
      "your hair tends to lose moisture quickly between washes, so a steady weekly rhythm gives you a reliable chance to put moisture back in",
    );
  } else if (p.includes("low")) {
    reasons.push(
      "product tends to build up on your strands over the week, and a weekly cleanse clears that so conditioner can actually get in",
    );
  } else {
    reasons.push(
      "washing once a week clears the sebum, product and daily grime that quietly builds up on the scalp",
    );
  }

  if (s.includes("oily")) {
    reasons.push(
      "your scalp runs a bit oilier, so leaving longer than a week lets follicles clog and slows things down",
    );
  } else if (s.includes("flaky") || s.includes("itchy")) {
    reasons.push(
      "your scalp is prone to flaking, and a consistent weekly wash is what keeps that irritation calm",
    );
  } else if (s.includes("dry")) {
    reasons.push(
      "your scalp tends to feel dry, so a gentle weekly cleanse followed by a moisture-rich conditioner resets it without stripping it",
    );
  }

  if (d.includes("high") || d.includes("thick")) {
    reasons.push(
      "with denser hair, shed strands and product sit close to the scalp, and only a proper weekly wash lifts them out",
    );
  }

  const activeGoals = goalTitles.slice(0, 2);
  if (activeGoals.length) {
    reasons.push(
      `a clean, well-cared-for scalp is the foundation for what you're working on — ${activeGoals.join(" and ")}`,
    );
  }

  // Join two reasons at most, with a natural connector rather than a semicolon.
  const picks = reasons.slice(0, 2);
  const why =
    picks.length === 2
      ? `${picks[0].charAt(0).toUpperCase()}${picks[0].slice(1)}. On top of that, ${picks[1]}.`
      : `${picks[0].charAt(0).toUpperCase()}${picks[0].slice(1)}.`;

  // Next-wash reminder — anchored to the actual last wash date, always the 7th day.
  let reminder: string;
  let nextDateIso: string | null = null;
  if (!lastWash) {
    reminder = "Log your first wash day and we'll time the next one for you.";
  } else {
    const nextDate = new Date(lastWash);
    nextDate.setDate(nextDate.getDate() + idealDays);
    const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / 86400000);
    const overdue = daysUntil < 0;
    // Anchor the scheduling CTA to today if overdue, otherwise the ideal date.
    const anchorDate = overdue ? today : nextDate;
    nextDateIso = `${anchorDate.getFullYear()}-${pad(anchorDate.getMonth() + 1)}-${pad(anchorDate.getDate())}`;

    if (overdue) {
      const overdueBy = Math.abs(daysUntil);
      reminder = `You're ${overdueBy} day${overdueBy === 1 ? "" : "s"} past your ideal wash day (${fmtDayLong(nextDate)}) — try to fit one in today or tomorrow so you stay on a weekly rhythm.`;
    } else if (daysUntil === 0) {
      reminder = `That makes today, ${fmtDayLong(today)}, your next wash day.`;
    } else if (daysUntil === 1) {
      reminder = `That puts your next wash tomorrow, ${fmtDayLong(nextDate)}.`;
    } else {
      reminder = `Your next wash lands on ${fmtDayLong(nextDate)}, ${daysUntil} days from now.`;
    }
  }

  const headline = "Wash weekly — every 7 days.";


  return {
    headline,
    window: cadenceLabel,
    why,
    reminder,
    nextDateIso,
  };
};

const encouragement = (count: number) => {
  if (count === 0) return "No wash days logged this month yet. Consistency is key to healthy hair.";
  if (count <= 2) return "Good start — keep going this month.";
  if (count <= 4) return "Great consistency — a steady rhythm is what your scalp and strands need.";
  return "Excellent — your scalp and hair will thank you for this routine.";
};

// Build a Google Calendar "Add event" URL for an all-day wash-day reminder.
const buildGoogleCalendarUrl = (iso: string) => {
  const compact = iso.replace(/-/g, "");
  const start = new Date(iso);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const endCompact = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Wash day — STRAND",
    dates: `${compact}/${endCompact}`,
    details:
      "Your STRAND weekly wash day. Double-cleanse the scalp, then hydrate the lengths. Open the app to log it when done.",
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
};

const fmtCardDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
};

const WashDayHub = () => {
  const navigate = useNavigate();
  const { washDays, loading } = useWashDays();
  const { goals } = useGoals();
  const { user } = useAuth();
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });

  // Scheduled future wash days — stored per user in localStorage as a simple
  // planning aid (no server-side row until they log the wash for real).
  const storageKey = user ? `strand.scheduledWashDays.${user.id}` : null;
  const [scheduled, setScheduled] = useState<string[]>([]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      const todayIso = isoFor(today.getFullYear(), today.getMonth(), today.getDate());
      // Prune past scheduled dates automatically.
      const pruned = arr.filter((d) => d >= todayIso);
      setScheduled(pruned);
      if (pruned.length !== arr.length) localStorage.setItem(storageKey, JSON.stringify(pruned));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const persistScheduled = (next: string[]) => {
    setScheduled(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };
  const scheduledSet = useMemo(() => new Set(scheduled), [scheduled]);

  const [scheduleDialogIso, setScheduleDialogIso] = useState<string | null>(null);
  const openScheduleDialog = (iso: string) => setScheduleDialogIso(iso);
  const confirmSchedule = () => {
    if (scheduleDialogIso && !scheduledSet.has(scheduleDialogIso)) {
      persistScheduled([...scheduled, scheduleDialogIso].sort());
    }
  };
  const removeSchedule = () => {
    if (scheduleDialogIso) {
      persistScheduled(scheduled.filter((d) => d !== scheduleDialogIso));
      setScheduleDialogIso(null);
    }
  };


  const { washDates, washDayIdsByDate, currentMonthCount } = useMemo(() => {
    const dates = new Set<string>();
    const ids: Record<string, string> = {};
    let monthCount = 0;
    for (const wd of washDays) {
      dates.add(wd.wash_date);
      // Latest entry per date wins (washDays sorted desc)
      if (!ids[wd.wash_date]) ids[wd.wash_date] = wd.id;
      const d = new Date(wd.wash_date);
      if (d.getFullYear() === view.year && d.getMonth() === view.month) monthCount++;
    }
    return { washDates: dates, washDayIdsByDate: ids, currentMonthCount: monthCount };
  }, [washDays, view]);

  const goPrev = () =>
    setView((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const goNext = () =>
    setView((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });

  const latestTipRaw = washDays.find((w) => w.next_wash_tip)?.next_wash_tip ?? null;
  const latestTip = useMemo(() => {
    if (!latestTipRaw) return null;
    try {
      const parsed = JSON.parse(latestTipRaw);
      if (parsed && typeof parsed === "object" && (parsed.action || parsed.why)) {
        return { action: parsed.action ?? "", why: parsed.why ?? "" };
      }
    } catch { /* legacy plain-text tip */ }
    return { action: latestTipRaw, why: "" };
  }, [latestTipRaw]);

  const overdue = useMemo(() => {
    if (!washDays.length) return null;
    const last = washDays[0]?.wash_date;
    if (!last) return null;
    const lastDate = new Date(last);
    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);
    if (diffDays <= 7) return null;
    const activeGoalTitles = (goals ?? [])
      .filter((g) => g.status !== "complete" && g.status !== "archived")
      .map((g) => g.title)
      .filter(Boolean)
      .slice(0, 2);
    return { diffDays, lastDate, goalTitles: activeGoalTitles };
  }, [washDays, goals, today]);

  const [clinical, setClinical] = useState<ClinicalContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadClinicalContext()
      .then((ctx) => { if (!cancelled) setClinical(ctx); })
      .catch(() => { /* non-fatal — encouragement falls back to generic copy */ });
    return () => { cancelled = true; };
  }, []);

  const educational = useMemo(() => {
    const lastIso = washDays[0]?.wash_date ?? null;
    const activeGoalTitles = (goals ?? [])
      .filter((g) => g.status !== "complete" && g.status !== "archived")
      .map((g) => g.title)
      .filter(Boolean) as string[];
    return buildEducationalNote({
      porosity: (clinical?.hair?.porosity ?? [])[0] ?? null,
      density: (clinical?.hair?.density ?? [])[0] ?? null,
      scalp: (clinical?.hair?.scalp ?? [])[0] ?? null,
      goalTitles: activeGoalTitles,
      lastWash: lastIso ? new Date(lastIso) : null,
      today,
    });
  }, [clinical, washDays, goals, today]);

  const overdueReason = (() => {
    if (!overdue) return "";
    const base = "Extended gaps between washes let sebum, product residue and environmental buildup accumulate on the scalp, which can restrict the follicle, aggravate inflammation and slow growth.";
    if (overdue.goalTitles.length) {
      return `${base} That directly works against your goal${overdue.goalTitles.length > 1 ? "s" : ""}: ${overdue.goalTitles.join(" and ")}. Log a wash day to keep the scalp environment on track.`;
    }
    return `${base} Log a wash day to reset your scalp environment.`;
  })();

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Wash Day" back={false} />
      <div className="px-5 space-y-4 pb-6">
        {overdue && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3"
          >
            <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive font-body">
                {overdue.diffDays} days since your last wash day
              </p>
              <p className="text-[12px] leading-snug text-destructive/90 font-body">
                {overdueReason}
              </p>
              <button
                onClick={() => navigate("/wash/step-1")}
                className="text-[12px] font-semibold text-destructive underline underline-offset-2 mt-1"
              >
                Log a wash day now →
              </button>
            </div>
          </div>
        )}
        {latestTip && (
          <NextWashTipCard action={latestTip.action} why={latestTip.why} />
        )}
        <Calendar
          year={view.year}
          month={view.month}
          washDates={washDates}
          washDayIdsByDate={washDayIdsByDate}
          onPrev={goPrev}
          onNext={goNext}
          onPickDate={(id) => navigate(`/wash-day/${id}`)}
          onLogDate={(iso) => navigate(`/wash/step-1?date=${iso}`)}
        />
        <SurfaceCard tone="gold">
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Droplets className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold font-body">
                Wash rhythm
              </p>
              <p className="font-display text-[15px] leading-snug mt-1 break-words">
                {educational.headline}
              </p>
              <p className="font-body text-[12.5px] leading-relaxed text-foreground/80 mt-2 break-words">
                Why this matters — {educational.why}
              </p>
              <div className="mt-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-bold font-body">
                  Next wash reminder
                </p>
                <p className="font-body text-[13px] leading-snug text-foreground mt-1 break-words">
                  {educational.reminder}
                </p>
                {educational.nextDateIso && (
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/wash/step-1?date=${educational.nextDateIso}`)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground text-[12.5px] font-semibold font-body px-4 py-2.5 shadow-sm hover:opacity-95 transition"
                    >
                      <CalendarClock className="size-4" />
                      Schedule this wash day
                    </button>
                    <a
                      href={buildGoogleCalendarUrl(educational.nextDateIso)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 bg-background text-[12.5px] font-semibold text-primary font-body px-4 py-2.5 hover:bg-primary/5 transition"
                    >
                      <CalendarPlus className="size-4" />
                      Add to Google Calendar
                    </a>
                  </div>
                )}
              </div>
              <p className="font-body text-[11.5px] text-muted-foreground mt-3">
                💧 {currentMonthCount} wash day{currentMonthCount === 1 ? "" : "s"} this month — {encouragement(currentMonthCount).toLowerCase()}
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>


      <SectionLabel>Previous wash days</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading wash days…" />
        ) : washDays.length === 0 ? (
          <EmptyState
            message="No wash days logged yet"
            hint="Tap the button below to log your first wash day."
          />
        ) : (
          washDays.map((wd, i) => {
            // washDays is sorted desc — the next-older wash is at i+1.
            const previous = washDays[i + 1] ?? null;
            const sequenceNumber = washDays.length - i;
            return (
              <WashDayCard
                key={wd.id}
                washDay={wd}
                sequenceNumber={sequenceNumber}
                previousWashDate={previous?.wash_date ?? null}
                onClick={() => navigate(`/wash-day/${wd.id}`)}
              />
            );
          })
        )}
      </div>

      <div className="px-5 pb-6">
        <Button variant="gold" size="pill" onClick={() => navigate("/wash/step-1")}>
          + Log Today's Wash Day
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashDayHub;
