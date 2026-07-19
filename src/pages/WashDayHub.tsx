import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWashDays } from "@/hooks/useWashDays";
import { useGoals } from "@/hooks/useGoals";
import { AlertTriangle } from "lucide-react";
import { NextWashTipCard } from "@/components/NextWashTipCard";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface CalProps {
  year: number;
  month: number; // 0-11
  washDates: Set<string>; // YYYY-MM-DD
  washDayIdsByDate: Record<string, string>;
  onPrev: () => void;
  onNext: () => void;
  onPickDate: (iso: string) => void;
  onLogDate: (iso: string) => void;
}

const pad = (n: number) => n.toString().padStart(2, "0");
const isoFor = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const Calendar = ({ year, month, washDates, washDayIdsByDate, onPrev, onNext, onPickDate, onLogDate }: CalProps) => {
  const first = new Date(year, month, 1);
  // Mon-Sun grid: shift Sunday (0) -> 6
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
          const isToday = iso === todayIso;
          const wdId = washDayIdsByDate[iso];
          const isPastOrToday = iso <= todayIso;
          const isTappable = isWash || isPastOrToday;
          const Tag = isTappable ? "button" : "span";
          const handleClick = isWash && wdId
            ? () => onPickDate(wdId)
            : isPastOrToday
              ? () => onLogDate(iso)
              : undefined;
          return (
            <Tag
              key={i}
              {...(isTappable ? { onClick: handleClick, "aria-label": isWash ? `View wash day on ${iso}` : `Log wash day on ${iso}` } : {})}
              className={cn(
                "h-9 flex items-center justify-center rounded-full font-body transition-colors",
                isWash && "bg-primary text-primary-foreground font-medium hover:bg-primary/90 cursor-pointer",
                isToday && !isWash && "border border-primary text-primary font-medium rounded-md hover:bg-primary/10",
                !isWash && !isToday && isPastOrToday && "text-foreground/70 hover:bg-primary/10 cursor-pointer",
                !isWash && !isToday && !isPastOrToday && "text-foreground/30",
              )}
            >
              {c}
            </Tag>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" /> Wash day</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-md border border-primary" /> Today</span>
      </div>
    </SurfaceCard>
  );
};

const encouragement = (count: number) => {
  if (count === 0) return "No wash days logged this month yet. Consistency is key to healthy hair.";
  if (count <= 2) return "Good start — keep going this month.";
  if (count <= 4) return "Great consistency — washing weekly keeps your scalp clean and your hair hydrated.";
  return "Excellent — your scalp and hair will thank you for this routine.";
};

const fmtCardDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
};

const WashDayHub = () => {
  const navigate = useNavigate();
  const { washDays, loading } = useWashDays();
  const { goals } = useGoals();
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });

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
          <p className="text-sm font-medium">
            💧 {currentMonthCount} wash day{currentMonthCount === 1 ? "" : "s"} this month
          </p>
          <p className="font-body text-sm text-muted-foreground mt-1">
            {encouragement(currentMonthCount)}
          </p>
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
          washDays.map((wd) => (
            <button
              key={wd.id}
              onClick={() => navigate(`/wash-day/${wd.id}`)}
              className="w-full text-left"
            >
              <SurfaceCard className="hover:border-primary/50 transition-colors">
                <p className="text-sm font-semibold font-body leading-tight">{fmtCardDate(wd.wash_date)}</p>
                {wd.steps?.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {wd.steps.map((s) => s.name).join(" · ")}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px]">
                  {wd.scalp_feel && (
                    <span className={cn(
                      "font-medium",
                      /clean|good|fresh|✓/i.test(wd.scalp_feel) ? "text-good" : "text-warn",
                    )}>
                      {wd.scalp_feel}
                    </span>
                  )}
                  {wd.breakage && (
                    <span className="text-muted-foreground">· Breakage: {wd.breakage}</span>
                  )}
                </div>
              </SurfaceCard>
            </button>
          ))
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
