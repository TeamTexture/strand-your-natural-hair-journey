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
import { WashDayCard } from "@/components/WashDayCard";
import { loadClinicalContext, type ClinicalContext } from "@/lib/clinicalContext";
import SponsoredWashDayTipCard from "@/components/washday/SponsoredWashDayTipCard";
import DailyEntryRow from "@/components/washday/DailyEntryRow";
import { useDailyHairEntries } from "@/hooks/useDailyHairEntries";
import { useUserProducts } from "@/hooks/useUserProducts";
import BrandBanner from "@/components/BrandBanner";
import { useDynamicWashTip } from "@/hooks/useDynamicWashTip";
import { Sparkles } from "lucide-react";
import AiProse from "@/components/tips/AiProse";
import LevelGate from "@/components/tips/LevelGate";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { BeginnerSteps } from "@/components/beginner/BeginnerGuide";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import AnchorStat from "@/components/guidance/AnchorStat";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import { dedupeSentences, emphasisSplit, splitSentences } from "@/lib/tipsRender";
import { restatesAction } from "@/lib/guidance";
import { blowDryCountLast7Days } from "@/lib/stylingHeat";
import { CircleSlash, Repeat, Ruler } from "lucide-react";
import { useWashDaySchedules } from "@/hooks/useWashDaySchedules";
import NextWashDayBox, { washDayCalendarEvent } from "@/components/wash/NextWashDayBox";
import { googleCalendarUrl } from "@/lib/addToCalendar";
import StyleProfilePrompt from "@/components/style/StyleProfilePrompt";
import AiProgressBar from "@/components/AiProgressBar";



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




const fmtCardDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
};

const WashDayHub = () => {
  const navigate = useNavigate();
  const { washDays, loading } = useWashDays();
  const { entries: dailyEntries } = useDailyHairEntries();
  const { products: shelfProducts } = useUserProducts("all", { static: true });
  const { goals } = useGoals();
  const { user } = useAuth();
  const { level, showBeginnerHelp } = useTipsLevel();
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });

  // Scheduled future wash days — persisted per user in wash_day_schedules.
  const {
    schedules,
    create: createSchedule,
    remove: removeScheduleRow,
  } = useWashDaySchedules();
  const activeSchedules = useMemo(
    () => schedules.filter((s) => s.status === "scheduled"),
    [schedules],
  );
  const scheduledSet = useMemo(
    () => new Set(activeSchedules.map((s) => s.scheduled_date)),
    [activeSchedules],
  );
  const scheduleByDate = useMemo(() => {
    const map: Record<string, (typeof activeSchedules)[number]> = {};
    for (const s of activeSchedules) map[s.scheduled_date] = s;
    return map;
  }, [activeSchedules]);

  const [scheduleDialogIso, setScheduleDialogIso] = useState<string | null>(null);
  const openScheduleDialog = (iso: string) => setScheduleDialogIso(iso);
  const confirmSchedule = () => {
    if (scheduleDialogIso && !scheduledSet.has(scheduleDialogIso)) {
      createSchedule.mutate({ date: scheduleDialogIso });
    }
  };
  const removeSchedule = () => {
    const row = scheduleDialogIso ? scheduleByDate[scheduleDialogIso] : null;
    if (row) removeScheduleRow.mutate(row.id);
    setScheduleDialogIso(null);
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

  // The per-log "next wash day tip" card (backed by the deprecated
  // wash_days.next_wash_tip column) has been removed. The generated
  // `wash_day_tip` card below is now the only AI tip on this screen.


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

  // Page-level sentence dedupe: the overdue alert, the AI tip card and the
  // wash-rhythm "why" all draw on the same cadence reasoning. Any sentence
  // already rendered higher up the page is dropped from later blocks.
  const pageSeen = useMemo(() => new Set<string>(), [overdue, educational]);

  // CONSEQUENCE only — one short, complete, never-truncated sentence: bold
  // 4–6 word lead-in + em-dash + one light clause of ≤ 12 words.
  // Derived from logs only — a rolling count of wash days in the trailing
  // 7 days whose styling heat included a blow dry (see src/lib/stylingHeat.ts).
  const blowDries = useMemo(() => blowDryCountLast7Days(washDays as Array<{ wash_date?: string | null; styling?: unknown }>), [washDays]);

  const OVERDUE_CTA = "Log a wash day now";
  const OVERDUE_LEAD = "Buildup is settling on your scalp";
  const OVERDUE_CLAUSE = "it can restrict follicles and slow growth.";
  const overdueReason = (() => {
    if (!overdue) return "";
    const base = `${OVERDUE_LEAD} — ${OVERDUE_CLAUSE}`;
    return splitSentences(base)
      .filter((s) => !restatesAction(s, OVERDUE_CTA))
      .join(" ");
  })();

  // Cadence reasoning appears at most once per page. Priority:
  // overdue alert > AI tip card > wash rhythm "why".
  const [dynamicTipShown, setDynamicTipShown] = useState(false);
  // True only while a sponsored wash day tip is actually on screen.
  const [sponsoredTipShown, setSponsoredTipShown] = useState(false);
  const cadenceReasoningTaken = Boolean(overdue) || dynamicTipShown;

  // Suggested next wash date — used to prefill the STRAND scheduling box.
  const nextIso = educational.nextDateIso;


  return (

    <ScreenLayout bottomNav>
      <TitleBar title="Wash Day" back={false} tips />
      <div className="px-5 space-y-4 pb-6">
        <StyleProfilePrompt />
        {overdue && (


          <div role="alert">
            {/* GUIDANCE CARD ANATOMY — status row → anchor stat → one
                consequence block → fact chips → one CTA. */}
            <GuidanceCard
              tone="warning"
              eyebrow="Wash day overdue"
              icon={AlertTriangle}
              footer={
                <div className="space-y-2.5">
                  <button
                    onClick={() => navigate("/wash/log")}
                    className="min-h-[44px] w-full inline-flex items-center justify-center rounded-pill bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition"
                  >
                    {OVERDUE_CTA} →
                  </button>
                  
                </div>
              }
            >
              <AnchorStat
                value={`${overdue.diffDays} day${overdue.diffDays === 1 ? "" : "s"}`}
                context="since your last wash"
                target={`Your rhythm: ${educational.window}`}
                targetIcon={Repeat}
              />
              <LevelGate min={2}>
                {(() => {
                  const reason = dedupeSentences(overdueReason, pageSeen);
                  if (!reason.trim()) return null;
                  const { phrase, rest } = emphasisSplit(reason);
                  return (
                    <div className="flex gap-2 rounded-[10px] border border-destructive/20 bg-destructive/[0.05] px-2.5 py-2">
                      <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                        <CircleSlash className="size-2.5 text-destructive" aria-hidden />
                      </span>
                      <p className="flex-1 min-w-0 text-[11.5px] leading-[1.55] font-body break-words">

                        <span className="font-semibold text-foreground">{phrase}</span>
                        {rest && <span className="text-foreground/75"> {rest}</span>}
                      </p>
                    </div>
                  );
                })()}
              </LevelGate>
              {overdue.goalTitles.length > 0 && (
                <KeyFactChips
                  tone="warning"
                  facts={overdue.goalTitles.map((title) => ({
                    label: `Works against your goal: ${title}`,
                    icon: Ruler,
                  }))}
                />
              )}
            </GuidanceCard>
          </div>
        )}


        {/* ONE tip, never two. The sponsored wash day tip REPLACES the
            educational tip when it renders (consent granted, a live wash_day
            placement today, an attached product, targeting matched). When it
            does not render, the educational tip renders exactly as before — a
            member is never left without a tip. */}
        <SponsoredWashDayTipCard onRendered={setSponsoredTipShown} />
        {!sponsoredTipShown && <DynamicWashTipCard onShown={setDynamicTipShown} />}

        {/* The brand's approved advert in full, beneath the tip — collapsed by
            default, expanding to the identical content the home page shows.
            Same component, no wash-day variant: the tip is added value, not a
            substitute for the placement they paid for. */}
        <BrandBanner slot="wash_day" collapsedCta="See full offer" />



        <div id="wash-calendar">
          <Calendar
            year={view.year}
            month={view.month}
            washDates={washDates}
            washDayIdsByDate={washDayIdsByDate}
            scheduledDates={scheduledSet}
            onPrev={goPrev}
            onNext={goNext}
            onPickDate={(id) => navigate(`/wash-day/${id}`)}
            onLogDate={(iso) => navigate(`/wash/log?date=${iso}`)}
            onScheduleDate={openScheduleDialog}
          />
        </div>

        {/* Next wash day box — mandatory STRAND scheduling plus the optional
            Google Calendar hand-off. Inline, never modal-blocking. */}
        <NextWashDayBox suggestedDate={nextIso} />



      </div>


      {blowDries > 0 && (
        <div className="px-5 pb-1">
          <p className="text-[11px] text-muted-foreground font-body">
            Blow dried on {blowDries} of your wash days in the last 7 days.
          </p>
        </div>
      )}

      <SectionLabel>Your hair history</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading wash days…" />
        ) : washDays.length === 0 && dailyEntries.length === 0 ? (
          <EmptyState
            message="No wash days logged yet"
            hint="Tap the button below to log your first wash day."
          />
        ) : (
          timeline.map((item) => {
            if (item.kind === "daily") {
              return (
                <DailyEntryRow key={item.entry.id} entry={item.entry} byId={productsById} />
              );
            }
            const wd = item.washDay;
            return (
              <WashDayCard
                key={wd.id}
                anchorId={wd.id}
                washDay={wd}
                sequenceNumber={item.sequenceNumber}
                previousWashDate={item.previousWashDate}
                onClick={() => navigate(`/wash-day/${wd.id}`)}
                onSeeAll={() => navigate(`/wash-day/${wd.id}#transcript`)}
              />
            );
          })
        )}
      </div>

      <div className="px-5 pb-6">
        <button
          type="button"
          onClick={() => navigate("/wash/favourites")}
          className="mb-3 w-full text-center text-[11.5px] font-body text-primary min-h-[36px]"
        >
          Wash Day Favourites
        </button>
        <Button variant="gold" size="pill" onClick={() => navigate("/wash/log")}>
          + Log Today's Wash Day
        </Button>
      </div>

      <Dialog open={scheduleDialogIso !== null} onOpenChange={(o) => { if (!o) setScheduleDialogIso(null); }}>
        <DialogContent className="max-w-[340px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {scheduleDialogIso && scheduledSet.has(scheduleDialogIso) ? "Scheduled wash day" : "Schedule a wash day"}
            </DialogTitle>
            <DialogDescription className="font-body text-[13px] leading-snug">
              {scheduleDialogIso && (
                <>
                  {fmtDayLong(new Date(scheduleDialogIso))}. {scheduledSet.has(scheduleDialogIso)
                    ? "This date is already on your STRAND calendar. You can add it to Google Calendar or remove it."
                    : "Plan this wash day in advance. You can also add it to your Google Calendar."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {scheduleDialogIso && !scheduledSet.has(scheduleDialogIso) && (
              <Button
                variant="gold"
                size="pill"
                onClick={() => { confirmSchedule(); setScheduleDialogIso(null); }}
              >
                <CalendarClock className="size-4 mr-1.5" />
                Add to STRAND calendar
              </Button>
            )}
            {scheduleDialogIso && scheduleByDate[scheduleDialogIso] && (
              <a
                href={googleCalendarUrl(washDayCalendarEvent(scheduleByDate[scheduleDialogIso]))}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 bg-background text-[12.5px] font-semibold text-primary font-body px-4 py-2.5 hover:bg-primary/5 transition"
              >
                <CalendarPlus className="size-4" />
                Add to Google Calendar
              </a>
            )}

            {scheduleDialogIso && scheduledSet.has(scheduleDialogIso) && (
              <button
                type="button"
                onClick={removeSchedule}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full text-destructive text-[12.5px] font-semibold font-body px-4 py-2.5 hover:bg-destructive/10 transition"
              >
                <Trash2 className="size-4" />
                Remove from calendar
              </button>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setScheduleDialogIso(null)}
              className="w-full text-center text-[12px] text-muted-foreground font-body py-1"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>

  );
};

const DynamicWashTipCard = ({ onShown }: { onShown?: (shown: boolean) => void }) => {
  const { data: tip, isLoading, isFetching, refetch } = useDynamicWashTip();
  useEffect(() => {
    onShown?.(Boolean(tip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip]);
  // NEVER an empty gap. While the tip is generating, or if generation failed,
  // the member sees a visible one-line state with a retry rather than a hole
  // in the page.
  if (!tip) {
    const working = isLoading || isFetching;
    return (
      <GuidanceCard tone="gold" eyebrow="Your wash day tip" icon={Sparkles} headline="Your tip is being prepared">
        <p className="text-[11.5px] leading-[1.55] font-body text-foreground/70">
          {working
            ? "We're putting together the one thing that will help your hair most on your next wash day."
            : "We couldn't finish your tip just now."}
        </p>
        {working ? (
          // wash-day-tip measured per generation (retries included):
          // p50 14.5s / p75 25.2s / p90 39.8s. 26s ≈ p75.
          <AiProgressBar
            expectedMs={26000}
            overrunNote="Still working — the tip is being re-checked before we show it."
            stages={[
              "Reading your hair profile",
              "Checking your recent wash days",
              "Finding the manuscript passage",
              "Writing your wash day tip",
            ]}
          />
        ) : (
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[11px] font-body font-semibold text-primary underline underline-offset-2"
          >
            Try again
          </button>
        )}
      </GuidanceCard>
    );
  }


  return (
    <GuidanceCard
      tone="gold"
      eyebrow="Your wash day tip"
      icon={Sparkles}
      headline={tip.headline}
    >
      {/* THE ACTION FLOOR — never level-gated. At the most minimal support
          level the card is headline + this one instruction; minimal means
          fewer words, never no content. */}
      {tip.action && tip.action.trim() && (
        <div className="flex gap-2 rounded-[10px] border border-primary/20 bg-primary/[0.06] px-2.5 py-2">
          <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Sparkles className="size-2.5 text-primary" aria-hidden />
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[11.5px] leading-[1.55] font-body text-foreground break-words">
              <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-primary mr-1.5">
                Do this
              </span>
              {tip.action.trim()}
            </p>
            {/* THE WHY — required at every support level, never gated. An
                instruction without a reason teaches nothing. */}
            {tip.reason && tip.reason.trim() && (
              <p className="text-[11px] leading-[1.55] font-body text-foreground/75 break-words">
                <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-foreground/50 mr-1.5">
                  Why
                </span>
                {tip.reason.trim()}
              </p>
            )}
          </div>
        </div>
      )}
      {/* THE EXTENDED WHY — hand-holding only. Levels 1 and 2 already carry the
          one-sentence "Why" above; repeating it as prose is the duplication the
          three-level scale exists to remove. */}
      <LevelGate min={3}>
        <AiProse text={tip.why} />
      </LevelGate>
      {/* No separate technique block — the action carries the how. */}

      {/* Optional — one thing to try on the NEXT wash day. Hand-holding only:
          at the lower levels the card is deliberately this wash day only. */}
      {tip.next_time && tip.next_time.trim() && (
        <LevelGate min={3}>
          <AiProse text={`Do this next wash: ${tip.next_time.trim()}`} />
        </LevelGate>
      )}
      {/* No BeginnerSteps here — level-4 depth comes from the server-side
          tips-level directive expanding the generated tip itself. Repeating
          the headline/why/technique as "steps" restated what was just read. */}
    </GuidanceCard>
  );

};

export default WashDayHub;

