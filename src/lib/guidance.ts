/**
 * Guidance rendering logic — pure helpers shared by every component in
 * `src/components/guidance/`.
 *
 * PRESENTATION ONLY. Nothing here rewrites, truncates or summarises guidance
 * copy: it splits AI prose into the labelled segments the model already emits,
 * matches an icon to each block, and extracts concrete parameters (frequency,
 * duration, tools) so they can be repeated visually as chips while the original
 * sentence stays fully intact.
 */
import {
  AlarmClock,
  AlertTriangle,
  Baby,
  CalendarClock,
  CalendarDays,
  Check,
  CircleSlash,
  Dot,
  Droplet,
  Droplets,
  FlaskConical,
  Hand,

  HeartPulse,
  Info,
  Layers,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Repeat,
  Ruler,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  ThermometerSun,
  Timer,
  Wind,
} from "lucide-react";

export type GuidanceTone = "gold" | "insight" | "warning" | "muted" | "good";

/* ------------------------------------------------------------------ *
 * Labelled segments
 * ------------------------------------------------------------------ */

interface LabelSpec {
  /** Canonical display label. */
  label: string;
  /** Alternative spellings the AI emits for the same idea. */
  aliases?: string[];
  icon: LucideIcon;
  tone: GuidanceTone;
}

const LABEL_SPECS: LabelSpec[] = [
  { label: "Why it matters", aliases: ["Why this matters", "Your signal", "The rationale", "Why"], icon: HeartPulse, tone: "good" },
  { label: "What to prioritise", aliases: ["Your focus", "Focus"], icon: Target, tone: "gold" },
  { label: "Technique", aliases: ["How to use it", "How to use", "How", "Method"], icon: Hand, tone: "insight" },
  { label: "Moisture", aliases: ["Hydration"], icon: Droplets, tone: "insight" },
  { label: "Product consistency", aliases: ["Product note", "Products"], icon: Repeat, tone: "insight" },
  { label: "Ingredient note", aliases: ["Ingredients"], icon: FlaskConical, tone: "insight" },
  { label: "Goal focus", aliases: ["Your goal"], icon: Target, tone: "gold" },
  { label: "Scalp signal", aliases: ["Scalp"], icon: Sparkles, tone: "insight" },
  { label: "Watch for", aliases: ["Watch out for", "Watch out", "Caution"], icon: AlertTriangle, tone: "warning" },
  { label: "Do this next wash", aliases: ["The action", "Try this", "Next step"], icon: Check, tone: "gold" },
  { label: "Best paired with", aliases: ["Best sources", "Pair with"], icon: Leaf, tone: "good" },
  { label: "How it helps", icon: HeartPulse, tone: "good" },
  { label: "Strand tip", aliases: ["Tip"], icon: Lightbulb, tone: "gold" },
  { label: "Note", icon: Info, tone: "muted" },
  { label: "Timing", aliases: ["When"], icon: AlarmClock, tone: "muted" },
];

const ALL_LABEL_WORDS = LABEL_SPECS.flatMap((s) => [s.label, ...(s.aliases ?? [])])
  // Longest first so "Why this matters" wins over "Why".
  .sort((a, b) => b.length - a.length);

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LABEL_SPLIT_RE = new RegExp(
  `\\*{0,2}\\b(${ALL_LABEL_WORDS.map(escapeRe).join("|")})\\b\\*{0,2}\\s*:\\*{0,2}`,
  "gi",
);

const specFor = (label: string): LabelSpec | undefined => {
  const key = label.toLowerCase().trim();
  return LABEL_SPECS.find(
    (s) =>
      s.label.toLowerCase() === key ||
      (s.aliases ?? []).some((a) => a.toLowerCase() === key),
  );
};

export interface GuidanceSegment {
  label: string;
  icon: LucideIcon;
  tone: GuidanceTone;
  body: string;
}

export interface ParsedGuidance {
  /** Unlabelled opening prose (the lead paragraph). */
  lead: string;
  /** Labelled sub-paragraphs, in the order the AI wrote them. */
  segments: GuidanceSegment[];
}

/** Normalise escaped newlines the AI sometimes emits literally. */
const normaliseBreaks = (raw: string) =>
  String(raw ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\/n\/n/g, "\n\n")
    .replace(/\/n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

/**
 * Split prose into a lead paragraph plus labelled segments.
 * Every character of the input survives into either `lead` or a segment body.
 */
export function parseGuidance(text: string | null | undefined): ParsedGuidance {
  const clean = normaliseBreaks(text ?? "").trim();
  if (!clean) return { lead: "", segments: [] };

  // Force each recognised label onto its own block boundary.
  //
  // COHERENCE GUARD: a label is only a heading when it starts a block — i.e. it
  // sits at the very beginning of the text or at the start of a line (allowing
  // bullet/markdown prefixes). Matching mid-sentence would decapitate real
  // prose: "That directly works against your goal: Length." must never be split
  // into "That directly works against" + a "Goal focus" block.
  const marked = clean.replace(LABEL_SPLIT_RE, (match, lbl: string, offset: number, full: string) => {
    const before = full.slice(0, offset);
    const atBlockStart = /(^|\n)[\s>*\-•\d.)]*$/.test(before);
    if (!atBlockStart) return match;
    return `\u0000${lbl}:`;
  });
  const parts = marked.split("\u0000");

  const lead = parts[0]?.trim() ?? "";
  const segments: GuidanceSegment[] = [];

  for (const part of parts.slice(1)) {
    const m = part.match(/^([^:]{2,32}):\s*([\s\S]*)$/);
    if (!m) {
      if (part.trim()) segments.push({ label: "Note", icon: Info, tone: "muted", body: part.trim() });
      continue;
    }
    const spec = specFor(m[1]) ?? { label: m[1].trim(), icon: Info, tone: "muted" as GuidanceTone };
    const body = m[2].trim();
    if (!body) continue;
    segments.push({ label: spec.label, icon: spec.icon, tone: spec.tone, body });
  }

  // FAILSAFE: a lead that ends mid-sentence (no terminator, or trailing
  // preposition/conjunction) means the split broke real prose. Rather than
  // render an incoherent fragment like "That directly works against", stitch
  // everything back into one intact paragraph.
  const leadBroken =
    Boolean(lead) &&
    segments.length > 0 &&
    (!/[.!?:]$/.test(lead) ||
      /\b(against|with|for|to|of|and|or|the|a|an|your|from|in|on|at|by|because|which|that)$/i.test(lead));
  if (leadBroken) {
    const whole = [lead, ...segments.map((s) => `${s.label}: ${s.body}`)].join(" ").replace(/\s+/g, " ").trim();
    return { lead: whole, segments: [] };
  }

  return { lead, segments };
}

/* ------------------------------------------------------------------ *
 * Action icons — MEANING ONLY
 * ------------------------------------------------------------------ *
 * Each entry maps a genuine concept to the icon that depicts it. If nothing
 * matches confidently we return a neutral dot rather than a wrong icon, and a
 * picker guarantees the same icon is never stamped twice inside one card.
 */

const ACTION_ICONS: Array<[RegExp, LucideIcon]> = [
  // Buildup / scalp congestion — the "stop water/residue" meaning.
  [/(buildup|build-up|build up|residue|sebum|clog|congest|flak|itch|inflam)/i, DropletOff],
  // Cadence and time.
  [/\b(every\s+\d|weekly|fortnightly|monthly|rhythm|cadence|routine|consistent|overdue|due|gap between)\b/i, Repeat],
  [/\b(minute|minutes|hour|hours|overnight|wait|leave it on|timer)\b/i, Timer],
  [/\b(book|schedule|calendar|appointment|next wash|plan)\b/i, CalendarDays],
  [/\b(day|days|today|tomorrow|week)\b(?=[^.]*\b(since|ago|past|last)\b)/i, CalendarClock],
  // Goal / measurement.
  [/\b(goal|target|aim|retention|length|growth|inch|cm)\b/i, Ruler],
  // Cleansing and moisture.
  [/(shampoo|cleanse|co-wash|clarif|rinse|wash)/i, Droplet],
  [/(moistur|hydrat|water|damp|spritz|leave-in|deep condition|deep-condition|conditioner|mask)/i, Droplets],
  // Heat.
  [/(tt heat hat|heat|warm|steam|thermal)/i, ThermometerSun],
  // Protection.
  [/(protect|seal|tuck|bonnet|satin|silk|shield|low tension|low manipulation)/i, ShieldCheck],
  // Products / ingredients.
  [/(product|ingredient|protein|keratin|glycerin|surfactant|oil|butter|formula)/i, FlaskConical],
  // Clinical.
  [/(iron|ferritin|vitamin|blood|thyroid|marker|gp |doctor|tsh)/i, Stethoscope],
  // Sectioning and technique.
  [/(section|part your hair|divide|quadrant)/i, Layers],
  [/(trim|cut|split end|scissors)/i, Scissors],
  [/(massage|fingertip|finger-smooth|smooth with your fingers)/i, Hand],
  [/\b(don't|do not|avoid|never|stop|careful|warning|watch out)\b/i, AlertTriangle],
];

/** Confident keyword → icon match, or undefined when nothing genuinely fits. */
export function matchGuidanceIcon(text: string): LucideIcon | undefined {
  for (const [re, Icon] of ACTION_ICONS) {
    if (re.test(text)) return Icon;
  }
  return undefined;
}

/** Neutral marker used when no icon carries real meaning for a line. */
export const NEUTRAL_ICON: LucideIcon = Dot;

/** Match a lucide icon to an action / instruction line by keyword. */
export function guidanceIcon(text: string): LucideIcon {
  return matchGuidanceIcon(text) ?? NEUTRAL_ICON;
}

/**
 * Icon discipline: one picker per card. The same icon is never returned twice —
 * a repeat falls back to the neutral dot so meaning stays honest.
 */
export function createIconPicker() {
  const used = new Set<LucideIcon>();
  return (text: string): LucideIcon => {
    const icon = matchGuidanceIcon(text);
    if (icon && !used.has(icon)) {
      used.add(icon);
      return icon;
    }
    return NEUTRAL_ICON;
  };
}

/* ------------------------------------------------------------------ *
 * Anchor stat — the hero number
 * ------------------------------------------------------------------ */

export interface AnchorStatValue {
  /** The numeral, e.g. "13". */
  value: string;
  /** Its context, e.g. "days since your last wash day". */
  context: string;
}

/**
 * Pull a number + its context out of guidance prose ("13 days since your last
 * wash day", "20 minutes under heat", "3 markers flagged") so it can be shown
 * as a stat instead of being buried in a sentence.
 */
export function extractAnchorStat(text: string | null | undefined): AnchorStatValue | null {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const m = clean.match(
    /\b(\d+(?:\.\d+)?)\s+(days?|weeks?|months?|minutes?|mins?|hours?|inch(?:es)?|cm|markers?|sections?|washes|wash days?)\b([^.!?]*)/i,
  );
  if (!m) return null;
  const tail = (m[3] ?? "").trim().replace(/^[,—-]\s*/, "");
  return { value: m[1], context: [m[2], tail].filter(Boolean).join(" ") };
}

/**
 * True when a block of copy says nothing beyond what the button already says —
 * such a block is deleted rather than rendered ("one CTA" rule).
 */
export function restatesAction(block: string, cta: string | null | undefined): boolean {
  const words = (v: string) =>
    new Set(
      String(v ?? "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    );
  const b = words(block);
  const c = words(cta ?? "");
  if (b.size === 0 || c.size === 0) return false;
  let hits = 0;
  c.forEach((w) => { if (b.has(w)) hits += 1; });
  // The block adds nothing when it is short and echoes the CTA's verbs/nouns.
  return hits / c.size >= 0.6 && b.size <= c.size * 3;
}

const STOP_WORDS = new Set([
  "the", "your", "you", "and", "for", "with", "that", "this", "now", "keep", "get",
  "are", "was", "has", "have", "will", "can", "its", "into", "from", "out", "just",
]);


/* ------------------------------------------------------------------ *
 * Key-fact chips — extract-and-highlight
 * ------------------------------------------------------------------ */

export interface KeyFact {
  label: string;
  icon: LucideIcon;
}

const FACT_PATTERNS: Array<{ re: RegExp; icon: LucideIcon; format?: (m: RegExpMatchArray) => string }> = [
  { re: /\bTT\s+Heat\s+Hat\b/i, icon: ThermometerSun, format: () => "TT Heat Hat" },
  { re: /\bevery\s+(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*(days?|weeks?|months?)\b/i, icon: Repeat },
  { re: /\b(once|twice)\s+a\s+(week|month|fortnight)\b/i, icon: Repeat },
  { re: /\b(weekly|fortnightly|monthly|bi-weekly|biweekly)\b/i, icon: Repeat },
  { re: /\b(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*(minutes?|mins?|hours?)\b/i, icon: Timer },
  { re: /\b(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*wash\s*(?:days?|cycles?)\b/i, icon: Droplets },
  { re: /\b(\d+)\s*sections?\b/i, icon: Layers },
  { re: /\b(high|low|medium)\s+porosity\b/i, icon: Droplet },
  { re: /\b(two-step|double)\s+cleanse\b/i, icon: Hand },
  { re: /\blength\s+retention\b/i, icon: Ruler },
  { re: /\blow\s+(?:tension|manipulation)\b/i, icon: ShieldCheck },
  { re: /\btype\s*[1-4][abc]?\b/i, icon: Sparkles },
  { re: /\b[1-4][abc]\b(?=\s+(?:hair|strands|curls|coils))/i, icon: Sparkles },
  { re: /\b(high|low|medium|normal)\s+density\b/i, icon: Layers },
  { re: /\b(fine|medium|coarse)\s+(?:strands|hair|diameter)\b/i, icon: Ruler },
  { re: /\b\d+(?:\.\d+)?[-\s]?inch(?:es)?\b/i, icon: Ruler },
  { re: /\bTWA\b/, icon: Ruler, format: () => "TWA" },
  { re: /\b(box braids|cornrows|twists|locs|wig|weave|protective style|loose natural)\b/i, icon: ShieldCheck },
  { re: /\b(low|high)\s+(ferritin|vitamin\s*d|vitamin\s*b12|b12|tsh|iron|zinc|folate|haemoglobin)\b/i, icon: Stethoscope },
  { re: /\b(ferritin|vitamin\s*d|vitamin\s*b12|tsh|thyroid|folate)\b/i, icon: Stethoscope },
  { re: /\bdeep[-\s]condition(?:ing|er)?\b/i, icon: Droplets, format: () => "Deep condition" },
  { re: /\bclarif(?:y|ying|ication)\b/i, icon: FlaskConical, format: () => "Clarify" },
  { re: /\bmoisture retention\b/i, icon: Droplets },
  { re: /\bprotein\b/i, icon: FlaskConical, format: () => "Protein" },
  { re: /\b(satin|silk)\s+(?:bonnet|scarf|pillowcase)\b/i, icon: ShieldCheck },
  { re: /\bleave-in\b/i, icon: Droplet, format: () => "Leave-in" },
  { re: /\bscalp\s+(?:cleans|massage|care|health)\w*/i, icon: Hand, format: () => "Scalp care" },
];

const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/**
 * Pull the concrete parameters out of guidance prose so they can be repeated as
 * chips. The sentence itself is never modified — this is additive emphasis.
 */
export function extractKeyFacts(text: string | null | undefined, max = 5): KeyFact[] {
  const clean = String(text ?? "").replace(/\s+/g, " ");
  if (!clean) return [];
  const out: KeyFact[] = [];
  const seen = new Set<string>();
  for (const { re, icon, format } of FACT_PATTERNS) {
    const m = clean.match(re);
    if (!m) continue;
    const label = titleCase((format ? format(m) : m[0]).trim());
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, icon });
    if (out.length >= max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Sequences
 * ------------------------------------------------------------------ */

/** True when a block of prose reads as a numbered sequence ("1. … 2. …"). */
export function looksSequential(text: string | null | undefined): boolean {
  const clean = String(text ?? "");
  return /(^|\s)1[.)]\s/.test(clean) && /(^|\s)2[.)]\s/.test(clean);
}

/** Split "1. … 2. … 3. …" prose into its steps, keeping every word. */
export function splitNumberedSteps(text: string | null | undefined): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean
    .split(/(?:^|\s)(?=\d{1,2}[.)]\s)/)
    .map((p) => p.replace(/^\d{1,2}[.)]\s*/, "").trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [];
}

/** Tone → tailwind classes built only from existing design tokens. */
export const TONE_CLASSES: Record<GuidanceTone, { box: string; chip: string; icon: string; label: string }> = {
  gold: {
    box: "border-primary/25 bg-primary/[0.07]",
    chip: "bg-primary/15 border-primary/25",
    icon: "text-primary",
    label: "text-primary",
  },
  insight: {
    box: "border-border bg-secondary/40",
    chip: "bg-secondary border-border",
    icon: "text-foreground/70",
    label: "text-foreground/70",
  },
  good: {
    box: "border-good/30 bg-good/[0.08]",
    chip: "bg-good/15 border-good/30",
    icon: "text-good",
    label: "text-good",
  },
  warning: {
    box: "border-destructive/30 bg-destructive/[0.07]",
    chip: "bg-destructive/12 border-destructive/30",
    icon: "text-destructive",
    label: "text-destructive",
  },
  muted: {
    box: "border-border bg-muted/50",
    chip: "bg-muted border-border",
    icon: "text-muted-foreground",
    label: "text-muted-foreground",
  },
};
