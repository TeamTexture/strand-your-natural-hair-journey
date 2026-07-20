import { Package, Clock, Mic, ListChecks, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WashDay } from "@/hooks/useWashDays";

interface Props {
  washDay: WashDay;
  sequenceNumber: number;
  previousWashDate: string | null;
  onClick: () => void;
}

/**
 * Wash day card — surfaces the signals the user actually benefits from:
 * date, style, products used, steps taken, duration, health chips, and a
 * one-line key insight distilled from the AI observation / next-wash tip.
 */
export const WashDayCard = ({ washDay, sequenceNumber, onClick }: Props) => {
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

  // ---------- Counts ----------
  const productCount = (() => {
    if (Array.isArray(washDay.product_ids) && washDay.product_ids.length > 0) {
      return washDay.product_ids.length;
    }
    return (washDay.steps ?? []).filter((s) => s.product_id || s.product_name).length;
  })();
  const stepCount = (washDay.steps ?? []).filter((s) => s.name?.trim()).length;

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

  // ---------- Key insight (full text, markdown stripped) ----------
  const stripMd = (s: string) =>
    s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#>_`]/g, "").trim();
  const insightRaw = (() => {
    if (washDay.ai_insight) return washDay.ai_insight;
    if (washDay.next_wash_tip) {
      try {
        const parsed = JSON.parse(washDay.next_wash_tip);
        if (parsed && typeof parsed === "object") {
          return [parsed.action, parsed.why].filter(Boolean).join(" ") || null;
        }
      } catch { /* plain text */ }
      return washDay.next_wash_tip;
    }
    return washDay.hair_feel_note || null;
  })();
  const insight = insightRaw ? stripMd(insightRaw) : null;


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

      {/* Stat grid: products / steps / duration */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-primary/[0.06] border border-primary/15 px-2.5 py-2 flex flex-col items-start">
          <div className="flex items-center gap-1 text-primary">
            <Package className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="font-display text-[18px] leading-none">{productCount}</span>
          </div>
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-foreground/60 font-body mt-1">
            Product{productCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="rounded-xl bg-primary/[0.06] border border-primary/15 px-2.5 py-2 flex flex-col items-start">
          <div className="flex items-center gap-1 text-primary">
            <ListChecks className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="font-display text-[18px] leading-none">{stepCount}</span>
          </div>
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-foreground/60 font-body mt-1">
            Step{stepCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="rounded-xl bg-primary/[0.06] border border-primary/15 px-2.5 py-2 flex flex-col items-start">
          <div className="flex items-center gap-1 text-primary">
            <Clock className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="font-display text-[15px] leading-none">
              {durationLabel ?? "—"}
            </span>
          </div>
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-foreground/60 font-body mt-1">
            Duration
          </span>
        </div>
      </div>

      {/* Key insight */}
      {insight && (
        <div className="rounded-xl bg-gradient-to-br from-primary/[0.09] to-primary/[0.03] border border-primary/20 px-3 py-2.5 mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3 h-3 text-primary" strokeWidth={2.5} />
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-primary font-body">
              Key insight
            </span>
          </div>
          <p className="text-[12.5px] leading-snug text-foreground/85 font-body break-words whitespace-pre-line">
            {insight}
          </p>

        </div>
      )}

      {/* Health chips + voice note */}
      {(scalpTone || breakageTone || hasVoiceNote) && (
        <div className="flex items-center justify-between border-t border-foreground/[0.06] pt-3 gap-3">
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
          {hasVoiceNote && (
            <div className="shrink-0 flex items-center gap-1 text-primary" aria-label="Voice note attached">
              <Mic className="w-4 h-4" strokeWidth={2} />
            </div>
          )}
        </div>
      )}
    </button>
  );
};

export default WashDayCard;
