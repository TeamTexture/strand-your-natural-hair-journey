import { ReactNode } from "react";
import { safeRewrite, stripDefinitionBrackets } from "@/lib/coherence";
import {
  AlertTriangle,
  Check,
  Clock,
  Droplet,
  Hand,
  Info,
  Scissors,
  LayoutGrid,
  Sparkles,
  ThermometerSun,
  Timer,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Level 3 (Hand-holding) — "Dummies guide" presentation primitives.
 *
 * Used only when the user's support level is 4. Everything here is
 * deliberately visual: one action per card, an icon per action, plain
 * language, big touch targets, visible timings and green-tick / red-cross
 * do-and-don't pairs.
 *
 * Level 3 shows the MOST information of any level. Every step is rendered in
 * full at once — never one at a time, never collapsed, never hidden behind
 * progressive disclosure. Beginner surfaces ADD to the level-3 content, they
 * never replace or reduce it.
 * ------------------------------------------------------------------ */

/** Pick a simple illustrative icon from the wording of an instruction. */
export function pickTipIcon(text: string): LucideIcon {
  const t = text.toLowerCase();
  if (/\b(don't|do not|avoid|never|careful|warning)\b/.test(t)) return AlertTriangle;
  if (/(water|wet|rinse|soak|damp|hydrat|moistur)/.test(t)) return Droplet;
  if (/(minute|hour|wait|leave it|timing|overnight)/.test(t)) return Clock;
  if (/(massage|fingertip|hands|palm|scrub|detangle|comb)/.test(t)) return Hand;
  if (/(heat|warm|hat|steam|dry|blow)/.test(t)) return ThermometerSun;
  if (/(section|part |parts|divide)/.test(t)) return LayoutGrid;
  if (/(trim|cut|split end)/.test(t)) return Scissors;
  if (/(air|breath|scalp|oxygen)/.test(t)) return Wind;
  return Sparkles;
}

/** Pull a human time out of an instruction ("leave for 20 minutes"). */
export function extractTime(text: string): string | null {
  const m = text.match(/(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*(minute|minutes|min|mins|hour|hours|second|seconds)\b/i);
  if (!m) return null;
  const unit = m[3].toLowerCase().startsWith("hour")
    ? "hr"
    : m[3].toLowerCase().startsWith("sec")
      ? "sec"
      : "min";
  return m[2] ? `${m[1]}–${m[2]} ${unit}` : `${m[1]} ${unit}`;
}

/**
 * Technical-term handling.
 *
 * Definitions are NEVER appended to prose — that produced the same sentence
 * repeated in several blocks on one screen. A term is explained once per page
 *
 * This helper now only cleans the copy it is given: bracketed asides out,
 * coherence guarded. It is kept as the single entry point so every renderer
 * keeps calling one function.
 */
export function plainLanguage(text: string): string {
  if (!text) return text;
  return safeRewrite(text, stripDefinitionBrackets(text));
}





export interface BeginnerStep {
  /** Action headline — max 8 words. */
  text: string;
  /** Body — max 30 words. Never a paragraph. */
  detail?: string;
  /** One short "why" line — max 15 words. */
  why?: string;
  /** Optional plain definition shown under the step. */
  define?: string;
}

/** A visible time badge, e.g. "20 min". */
export const TimeBadge = ({ time }: { time: string }) => (
  <span className="inline-flex items-center gap-1 rounded-pill bg-primary/12 text-primary px-2 py-0.5 text-[10px] font-semibold">
    <Timer className="size-3" />
    {time}
  </span>
);

/**
 * Numbered, icon-led step cards with a "Step n of N" progress line.
 * Large touch-friendly rows with generous spacing.
 */
export const BeginnerSteps = ({
  steps,
  className,
}: {
  steps: BeginnerStep[];
  className?: string;
}) => {
  if (steps.length === 0) return null;
  return (
    <>
    <ol className={cn("space-y-2.5 animate-in fade-in-0 duration-300", className)}>
      {steps.map((s, i) => {
        const Icon = pickTipIcon(s.text);
        const time = extractTime(s.text);
        return (
          <li
            key={i}
            className="rounded-[14px] border border-primary/20 bg-background/70 p-3.5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                Step {i + 1} of {steps.length}
              </span>
              {time && <TimeBadge time={time} />}
            </div>
            <div className="flex items-start gap-3">
              <span className="relative size-10 rounded-full bg-primary/12 flex items-center justify-center shrink-0">
                <Icon className="size-5 text-primary" />
                <span className="absolute -top-1 -right-1 size-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] leading-relaxed text-foreground">
                  {plainLanguage(s.text)}
                </p>
                {s.detail && (
                  <p className="text-[12px] leading-relaxed text-muted-foreground mt-1.5">
                    {plainLanguage(s.detail)}
                  </p>
                )}
                {s.why && (
                  <p className="mt-1 text-[11.5px] leading-snug text-foreground/75 font-body">
                    Why: {plainLanguage(s.why)}
                  </p>
                )}
                {s.define && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
                    <Info className="size-3.5 text-primary shrink-0 mt-[1px]" />
                    <span>{s.define}</span>
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
    </>
  );
};

/** Green tick / red cross pairs for correct vs incorrect practice. */
export const DoDont = ({
  dos,
  donts,
  className,
}: {
  dos: string[];
  donts: string[];
  className?: string;
}) => {
  if (dos.length === 0 && donts.length === 0) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-2 animate-in fade-in-0 duration-300", className)}>
      <div className="rounded-[12px] border border-good/40 bg-good/8 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="size-5 rounded-full bg-good/20 flex items-center justify-center">
            <Check className="size-3 text-good" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-good">Do</span>
        </div>
        <ul className="space-y-1.5">
          {dos.map((d, i) => (
            <li key={i} className="text-[12px] leading-snug text-foreground/90">
              {plainLanguage(d)}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-[12px] border border-destructive/35 bg-destructive/8 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="size-5 rounded-full bg-destructive/20 flex items-center justify-center">
            <X className="size-3 text-destructive" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-destructive">Don't</span>
        </div>
        <ul className="space-y-1.5">
          {donts.map((d, i) => (
            <li key={i} className="text-[12px] leading-snug text-foreground/90">
              {plainLanguage(d)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
