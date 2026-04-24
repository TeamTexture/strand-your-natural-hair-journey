import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const washDays = [3, 10, 14, 23];
const today = 24;

const Calendar = () => {
  // Build April 2026 grid (Apr 1 2026 = Wednesday)
  // Mon-Sun layout. Apr 1 -> day index 2 (Wed).
  const startOffset = 2;
  const daysInMonth = 30;
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between mb-3">
        <button aria-label="Previous month" className="p-1 text-muted-foreground"><ChevronLeft className="size-4" /></button>
        <p className="font-display text-base">April 2026</p>
        <button aria-label="Next month" className="p-1 text-muted-foreground"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground text-center mb-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-xs text-center">
        {cells.map((c, i) => {
          if (c === null) return <span key={i} />;
          const isWash = washDays.includes(c);
          const isToday = c === today;
          return (
            <span
              key={i}
              className={cn(
                "h-8 flex items-center justify-center rounded-full font-body",
                isWash && "bg-primary text-primary-foreground font-medium",
                isToday && !isWash && "border border-primary text-primary font-medium rounded-md",
                !isWash && !isToday && "text-foreground/70",
              )}
            >
              {c}
            </span>
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

interface WD { date: string; steps: string; status: string; statusTone: "good" | "warn"; breakage: string }
const previous: WD[] = [
  { date: "Thu 23 April 2026", steps: "Pre-poo · Cleanse · Deep cond · Wash & go", status: "Clean ✓", statusTone: "good", breakage: "Minimal" },
  { date: "Mon 14 April 2026", steps: "Cleanse · Condition · Twist-out", status: "Itchy ⚠", statusTone: "warn", breakage: "Moderate" },
  { date: "Thu 10 April 2026", steps: "Pre-poo · Cleanse · Deep cond · Wash & go", status: "Clean ✓", statusTone: "good", breakage: "None" },
  { date: "Fri 3 April 2026", steps: "Cleanse · Condition · Loose natural", status: "Clean ✓", statusTone: "good", breakage: "Minimal" },
];

const WashDayHub = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Wash Day" back={false} />
      <div className="px-5 space-y-4 pb-6">
        <Calendar />
        <SurfaceCard tone="gold">
          <p className="text-sm font-medium">💧 4 wash days this month</p>
          <p className="font-script italic text-sm text-muted-foreground mt-1">
            Great consistency — washing weekly keeps your scalp clean and your hair hydrated.
          </p>
        </SurfaceCard>
      </div>

      <SectionLabel>Previous wash days</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {previous.map((wd) => (
          <SurfaceCard key={wd.date}>
            <p className="text-sm font-semibold font-body leading-tight">{wd.date}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{wd.steps}</p>
            <div className="flex items-center gap-3 mt-2 text-[11px]">
              <span className={cn(wd.statusTone === "good" ? "text-good" : "text-warn", "font-medium")}>
                {wd.status}
              </span>
              <span className="text-muted-foreground">· Breakage: {wd.breakage}</span>
            </div>
          </SurfaceCard>
        ))}
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
