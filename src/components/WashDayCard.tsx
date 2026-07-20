import { Package, Clock, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WashDay } from "@/hooks/useWashDays";

interface Props {
  washDay: WashDay;
  sequenceNumber: number;
  previousWashDate: string | null; // ISO date of the older wash immediately before this one
  onClick: () => void;
}

/**
 * "Rhythm-focused data card" — the selected prototype direction for Previous wash days.
 * Surfaces at-a-glance signals the user actually benefits from: wash #, date, style,
 * product count, duration, voice-note pin, scalp/breakage health chips, and a
 * 7-dot rhythm indicator anchored to the STRAND 7-day wash cadence.
 */
export const WashDayCard = ({ washDay, sequenceNumber, previousWashDate, onClick }: Props) => {
  // ---------- Relative time ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [wy, wm, wd] = washDay.wash_date.split("-").map(Number);
  const washDate = new Date(wy, (wm ?? 1) - 1, wd ?? 1);
  const daysAgo = Math.max(
    0,
    Math.round((today.getTime() - washDate.getTime()) / 86_400_000),
  );
  const relative =
    daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`;

  // ---------- Date label ----------
  const weekday = washDate.toLocaleDateString(undefined, { weekday: "long" });
  const month = washDate.toLocaleDateString(undefined, { month: "short" });
  const day = washDate.getDate();
  const dateLabel = `${weekday}, ${month} ${day}`;

  // ---------- Rhythm (7-day cadence) ----------
  let gap: number | null = null;
  if (previousWashDate) {
    const [py, pm, pd] = previousWashDate.split("-").map(Number);
    const prev = new Date(py, (pm ?? 1) - 1, pd ?? 1);
    gap = Math.round((washDate.getTime() - prev.getTime()) / 86_400_000);
  }
  let rhythmLabel = "First wash";
  let rhythmTone: "gold" | "warn" | "alert" | "muted" = "muted";
  if (gap !== null) {
    if (gap >= 6 && gap <= 8) {
      rhythmLabel = "On rhythm";
      rhythmTone = "gold";
    } else if (gap < 6) {
      rhythmLabel = "Early";
      rhythmTone = "warn";
    } else if (gap <= 10) {
      rhythmLabel = "A little late";
      rhythmTone = "warn";
    } else {
      rhythmLabel = "Overdue";
      rhythmTone = "alert";
    }
  }
  // 7 dots, filled up to min(gap, 7); if first wash, fill 1.
  const filledDots = gap === null ? 1 : Math.min(Math.max(gap, 0), 7);

  const rhythmColor =
    rhythmTone === "gold"
      ? "text-primary"
      : rhythmTone === "warn"
        ? "text-warn"
        : rhythmTone === "alert"
          ? "text-destructive"
          : "text-muted-foreground";

  // ---------- Products count ----------
  const productCount = (() => {
    if (Array.isArray(washDay.product_ids) && washDay.product_ids.length > 0) {
      return washDay.product_ids.length;
    }
    return (washDay.steps ?? []).filter((s) => s.product_id || s.product_name).length;
  })();

  // ---------- Duration ----------
  const durationLabel = (() => {
    const m = washDay.duration_min;
    if (!m || m <= 0) return null;
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
  })();

  // ---------- Style ----------
  const style =
    washDay.style_after && washDay.style_after.trim().length > 0
      ? washDay.style_after
      : (washDay.steps ?? []).map((s) => s.name).filter(Boolean).join(" · ") || "Wash & condition";

  // ---------- Health chips ----------
  const scalpTone = (() => {
    const s = (washDay.scalp_feel || "").toLowerCase();
    if (!s) return null;
    if (/clean|fresh|good|healthy|calm|balanced|✓/.test(s)) return "good" as const;
    if (/itch|flak|dry|tight|sore|irritat|oily|greasy/.test(s)) return "warn" as const;
    return "neutral" as const;
  })();
  const breakageTone = (() => {
    const b = (washDay.breakage || "").toLowerCase();
    if (!b) return null;
    if (/none|no\b|minimal/.test(b)) return "good" as const;
    if (/some|a bit|moderate/.test(b)) return "warn" as const;
    if (/a lot|lots|heavy|excess/.test(b)) return "alert" as const;
    return "neutral" as const;
  })();

  const chipClass = (t: "good" | "warn" | "alert" | "neutral" | null) =>
    cn(
      "px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-tight font-body border",
      t === "good" && "bg-good/10 text-good border-good/25",
      t === "warn" && "bg-warn/10 text-warn border-warn/25",
      t === "alert" && "bg-destructive/10 text-destructive border-destructive/25",
      (t === "neutral" || t === null) && "bg-muted text-foreground/70 border-foreground/10",
    );

  const hasVoiceNote = Boolean(washDay.hair_feel_voice_url);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-[24px] border border-foreground/[0.07] bg-card p-5",
        "shadow-[0_4px_20px_-8px_rgba(74,55,40,0.10)]",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(74,55,40,0.18)] hover:border-primary/40",
        "active:translate-y-0",
      )}
      aria-label={`View wash day #${sequenceNumber}, ${dateLabel}`}
    >
      {/* Header: wash # + relative time */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary font-body">
          Wash #{sequenceNumber}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground font-body">
          {relative}
        </span>
      </div>

      {/* Date + style */}
      <div className="mb-4">
        <h3 className="font-display text-[22px] leading-tight text-foreground break-words">
          {dateLabel}
        </h3>
        <p className="text-[15px] font-medium text-foreground/85 mt-1 font-body break-words">
          {style}
        </p>
      </div>

      {/* Metadata row */}
      {(productCount > 0 || durationLabel || hasVoiceNote) && (
        <div className="flex items-center gap-3 mb-4 text-[13px] text-foreground/70 font-body">
          {productCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" strokeWidth={2} />
              <span>
                {productCount} product{productCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
          {productCount > 0 && durationLabel && (
            <div className="w-1 h-1 rounded-full bg-primary/30" />
          )}
          {durationLabel && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{durationLabel}</span>
            </div>
          )}
          {hasVoiceNote && (
            <div className="ml-auto flex items-center gap-1 text-primary" aria-label="Voice note attached">
              <Mic className="w-4 h-4" strokeWidth={2} />
            </div>
          )}
        </div>
      )}

      {/* Health chips + rhythm */}
      <div className="flex items-end justify-between border-t border-foreground/[0.06] pt-4 gap-3">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {scalpTone && (
            <span className={chipClass(scalpTone)}>Scalp: {washDay.scalp_feel}</span>
          )}
          {breakageTone && (
            <span className={chipClass(breakageTone)}>
              {/^(none|no)/i.test(washDay.breakage || "") ? "No breakage" : `Breakage: ${washDay.breakage}`}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={cn("text-[9px] font-bold uppercase tracking-[0.15em] font-body", rhythmColor)}>
            {rhythmLabel}
          </span>
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  i < filledDots
                    ? rhythmTone === "gold"
                      ? "bg-primary"
                      : rhythmTone === "warn"
                        ? "bg-warn"
                        : rhythmTone === "alert"
                          ? "bg-destructive"
                          : "bg-primary/60"
                    : "bg-foreground/10",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </button>
  );
};

export default WashDayCard;
