/**
 * Tips Level — shared rendering rules.
 *
 * Single source of truth for HOW MUCH of any guidance surface is shown at each
 * support level (1 Minimal → 4 Hand-holding). No page may hardcode its own
 * guidance density: every surface goes through the helpers here, or through the
 * components in `src/components/tips/`.
 *
 * Level contract (applies to EVERY consumer surface):
 *  1 Minimal      — essential data + ONE top-priority tip. No explanatory prose.
 *                   AI prose reduced to 1 sentence. Cards = name + one-line relevance.
 *  2 Essentials   — top 2–3 tips, short-form. AI prose = short paragraph (≤3 sentences).
 *                   Cards = what it is + what it means for you, condensed.
 *  3 Guided       — everything with the "why". Full AI prose. Full cards. (default)
 *  4 Hand-holding — level 3 content rebuilt as the illustrated dummies guide:
 *                   plain language, icons, numbered steps, do/don't, timers.
 */
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { TIPS_LEVEL_MAX, type TipsLevel } from "@/lib/tipsLevel";

/** A single piece of guidance anywhere in the app. */
export interface GuidanceTip {
  /** Higher = more important. Lower levels keep the highest-priority items. */
  priority: number;
  /** Short-form instruction — always shown at every level. */
  short: string;
  /** The reasoning — shown at level 3+. */
  why?: string;
  /** Plain-English definition of a technical term — shown at level 4. */
  define?: string;
  /** Correct practice pairs — shown at level 4 only. */
  dos?: string[];
  /** Incorrect practice pairs — shown at level 4 only. */
  donts?: string[];
  /** Non-negotiable education (two-step cleanse, trim/retention). Never
   *  dropped by the level quantity cap — only its depth changes. */
  alwaysShow?: boolean;
}

/** How many sentences of AI / editorial prose each level keeps. */
export const PROSE_SENTENCES: Record<TipsLevel, number> = {
  1: 1,
  2: 3,
  3: Number.POSITIVE_INFINITY,
  4: Number.POSITIVE_INFINITY,
};

/** Split prose into sentences without losing the terminator. */
export function splitSentences(text: string): string[] {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .filter(Boolean);
}

/** Sentences that only state a fact or bust a myth teach nothing on their own,
 *  so they must never become the whole of a condensed tip. */
const NON_ACTIONABLE = /(does not|doesn't|don't|won't|will not|isn't|is not|never)\s+(make|help|mean|grow|cause|speed)/i;
const ACTIONABLE = /\b(every|each|weeks?|months?|days?|when|if|aim|keep|use|book|trim|wash|apply|check|start|switch|avoid|do|leave|rinse|section|protect|once|twice)\b/i;

/** Pick the sentences that carry the actual guidance, in original order, so a
 *  condensed tip still tells the user what to do — never just a bare fact. */
function pickGuidance(sentences: string[], max: number): string[] {
  if (sentences.length <= max) return sentences;
  const scored = sentences.map((s, i) => {
    let score = 0;
    if (ACTIONABLE.test(s)) score += 2;
    if (NON_ACTIONABLE.test(s) && !ACTIONABLE.test(s)) score -= 3;
    return { s, i, score };
  });
  return scored
    .slice()
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((e) => e.s);
}

/**
 * Trim any block of prose (AI summary, explanation, marker overview) to the
 * verbosity the level allows. Level 4 additionally puts plain-English first for
 * technical terms.
 *
 * Condensing keeps the sentences that actually guide the user (action, cadence,
 * trigger) rather than blindly taking the first N sentences.
 */
export function condenseProse(text: string | null | undefined, level: TipsLevel): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (level >= 4) return plainLanguage(clean);
  const max = PROSE_SENTENCES[level];
  if (!Number.isFinite(max)) return clean;
  return pickGuidance(splitSentences(clean), max).join(" ");
}


/**
 * Strip the trailing "why" clause from a one-line instruction so levels 1–2
 * read as pure instruction rather than explanation.
 * "Section your hair — it helps product reach the scalp" → "Section your hair"
 */
export function shortForm(text: string, level: TipsLevel): string {
  if (level >= 3) return text;
  const clean = text.replace(/\s+/g, " ").trim();
  const cut = clean.split(/\s+(?:—|–)\s+|\s+(?:because|so that|which means|as this)\s+/i)[0];
  const first = splitSentences(cut)[0] ?? cut;
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

/**
 * Order by priority (highest first, stable) and cap to the level's quantity.
 * Items flagged `alwaysShow` survive the cap and are kept in priority order at
 * the front — non-negotiable education appears at every level.
 */
export function selectTips<T extends { priority: number; alwaysShow?: boolean }>(
  tips: T[] | null | undefined,
  level: TipsLevel,
): T[] {
  const list = [...(tips ?? [])].map((t, i) => ({ t, i }));
  list.sort((a, b) => b.t.priority - a.t.priority || a.i - b.i);
  const ordered = list.map((e) => e.t);
  const max = TIPS_LEVEL_MAX[level];
  if (!Number.isFinite(max)) return ordered;
  const kept = ordered.slice(0, max);
  for (const t of ordered) {
    if (t.alwaysShow && !kept.includes(t)) kept.push(t);
  }
  return kept;
}

/** How many secondary/supporting items (meal ideas, diet notes, extra stats)
 *  a list-style surface shows. Level 1 shows none. */
export const SUPPORTING_MAX: Record<TipsLevel, number> = {
  1: 0,
  2: 2,
  3: 6,
  4: Number.POSITIVE_INFINITY,
};

export function limitSupporting<T>(items: T[] | null | undefined, level: TipsLevel): T[] {
  const max = SUPPORTING_MAX[level];
  const list = items ?? [];
  return Number.isFinite(max) ? list.slice(0, max) : [...list];
}

/** True when a surface should render the reasoning behind an item. */
export const wantsWhy = (level: TipsLevel) => level >= 3;
/** True when a surface should render optional/secondary detail at all. */
export const wantsDetail = (level: TipsLevel) => level >= 2;
/** True when a surface should render the illustrated beginner presentation. */
export const wantsBeginner = (level: TipsLevel) => level >= 4;

/* ------------------------------------------------------------------ *
 * ONE THEME, ONCE — rendering-level de-duplication.
 *
 * The consumer app stacks several guidance surfaces on one screen (an AI
 * overview + a tips list, a fresh log-specific tip + a generic rhythm note).
 * When two blocks say the same thing, the second one is noise. These helpers
 * let a renderer drop any item whose opening already appears in the prose the
 * user has just read above it.
 * ------------------------------------------------------------------ */

const normaliseForCompare = (text: string) =>
  (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when `candidate` restates something already present in `reference`. */
export function restatesReference(
  candidate: string | null | undefined,
  reference: string | null | undefined,
  compareChars = 40,
): boolean {
  const c = normaliseForCompare(candidate ?? "");
  const r = normaliseForCompare(reference ?? "");
  if (!c || !r) return false;
  const opening = c.slice(0, compareChars).trim();
  if (opening.length < 12) return false;
  if (r.includes(opening)) return true;
  // Sentence-level overlap: a high word-overlap with any reference sentence.
  const candidateWords = new Set(opening.split(" ").filter((w) => w.length > 3));
  if (candidateWords.size < 3) return false;
  for (const sentence of splitSentences(r)) {
    const words = new Set(normaliseForCompare(sentence).split(" "));
    let hits = 0;
    for (const w of candidateWords) if (words.has(w)) hits++;
    if (hits / candidateWords.size >= 0.8) return true;
  }
  return false;
}

/** Drop tips that merely restate `reference` prose shown on the same screen. */
export function dedupeTips<T extends { short: string; alwaysShow?: boolean }>(
  tips: T[] | null | undefined,
  reference: string | null | undefined,
): T[] {
  const list = tips ?? [];
  if (!reference) return [...list];
  return list.filter((t) => t.alwaysShow || !restatesReference(t.short, reference));
}
