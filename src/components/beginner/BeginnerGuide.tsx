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
 * Level 4 — "Dummies guide" presentation primitives.
 *
 * Used only when the user's support level is 4. Everything here is
 * deliberately visual: one action per card, an icon per action, plain
 * language, big touch targets, visible timings and green-tick / red-cross
 * do-and-don't pairs.
 *
 * Level 4 shows the MOST information of any level. Every step is rendered in
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
 * Plain-English teaching sentences for unavoidable technical terms.
 *
 * These are never injected as bracketed asides. When a term appears in copy we
 * append a complete, grammatical sentence that explains what it means for this
 * user — the education is part of the advice, not a parenthesis inside it.
 */
type PlainTerm = {
  term: string;
  /** Explanation used when the term appears without a qualifier. */
  general: string;
  /** Explanations keyed by the qualifier in front of the term. */
  byQualifier?: Record<string, string>;
};

const PLAIN_TERMS: PlainTerm[] = [
  {
    term: "porosity",
    general:
      "Porosity is simply how easily your hair takes water in and how well it holds on to it.",
    byQualifier: {
      high:
        "High porosity means your hair soaks water up quickly but lets it go just as fast, so your job on wash day is to seal that moisture in rather than add more water later.",
      low:
        "Low porosity means water sits on the surface before it goes in, so warmth and time are what get moisture through to the inside of each strand.",
      medium:
        "Medium porosity means your hair takes water in steadily and holds it reasonably well, so a consistent weekly rhythm is usually enough.",
    },
  },
  {
    term: "surfactants",
    general:
      "Surfactants are the cleaning agents in shampoo — they lift oil and build-up off your scalp so water can rinse it away.",
  },
  {
    term: "surfactant",
    general:
      "A surfactant is the cleaning agent in shampoo — it lifts oil and build-up off your scalp so water can rinse it away.",
  },
  {
    term: "elasticity",
    general:
      "Elasticity is how far your hair can stretch and spring back before it snaps, and it is the clearest sign of whether your strands need moisture or protein.",
  },
  {
    term: "sebum",
    general:
      "Sebum is the natural oil your scalp makes, and it is what keeps your scalp comfortable between washes.",
  },
  {
    term: "cuticles",
    general:
      "The cuticles are the tiny overlapping scales on the outside of each strand, and they lie flat when your hair is moisturised and smooth.",
  },
  {
    term: "cuticle",
    general:
      "The cuticle is the outer layer of each strand, and when it lies flat your hair holds moisture and reflects light.",
  },
  {
    term: "density",
    general:
      "Density is how many strands you have on your head, and it decides how much product and how much sectioning you need.",
  },
  {
    term: "humectants",
    general:
      "Humectants are ingredients that pull water toward your hair, so they work best when you follow them with something that seals.",
  },
  {
    term: "emollients",
    general:
      "Emollients are the softening ingredients that smooth the surface of each strand so your hair feels slippery rather than rough.",
  },
];

const QUALIFIERS = ["high", "low", "medium", "fine", "coarse"];

/**
 * Teach the term instead of bracketing it.
 *
 * Any existing bracketed definition is stripped, then up to two complete
 * explanation sentences are appended so the guidance reads as one coherent
 * paragraph. Idempotent: copy that already carries the explanation is untouched.
 */
export function plainLanguage(text: string): string {
  if (!text) return text;
  const base = stripDefinitionBrackets(text);
  const additions: string[] = [];

  for (const entry of PLAIN_TERMS) {
    if (additions.length >= 2) break;
    const re = new RegExp(
      `(?:(${QUALIFIERS.join("|")})[\\s-])?\\b${entry.term}\\b(?![\\w-])`,
      "i",
    );
    const m = base.match(re);
    if (!m) continue;
    const qualifier = m[1]?.toLowerCase();
    const sentence =
      (qualifier && entry.byQualifier?.[qualifier]) || entry.general;
    // Already explained in this copy — don't repeat it.
    const marker = sentence.split(" ").slice(0, 5).join(" ").toLowerCase();
    if (base.toLowerCase().includes(marker)) continue;
    if (additions.some((a) => a === sentence)) continue;
    additions.push(sentence);
  }

  if (additions.length === 0) return base;
  const joined = `${base.replace(/\s+$/, "").replace(/([^.!?])$/, "$1.")} ${additions.join(" ")}`;
  return safeRewrite(base, joined);
}




export interface BeginnerStep {
  /** One action, plain language. */
  text: string;
  /** Optional extra sentence of reassurance or the why, kept simple. */
  detail?: string;
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

/** Warm one-line reassurance used to close level-4 surfaces. */
export const BeginnerReassurance = ({ children }: { children?: ReactNode }) => (
  <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
    <Sparkles className="size-3.5 text-primary shrink-0 mt-[1px]" />
    <span>{children ?? "Everything is here, so you can read it all through first and come back to any step. You do not need to get it all right today."}</span>
  </p>
);
