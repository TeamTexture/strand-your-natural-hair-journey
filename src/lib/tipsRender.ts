/**
 * Tips Level — shared rendering rules.
 *
 * Single source of truth for HOW MUCH of any guidance surface is shown at each
 * support level (1 Minimal → 3 Hand-holding). No page may hardcode its own
 * guidance density: every surface goes through the helpers here, or through the
 * components in `src/components/tips/`.
 *
 * Level contract (applies to EVERY consumer surface):
 *  1 Minimal      — essential data + ONE top-priority tip: action + one-sentence
 *                   why. No explanatory prose. AI prose reduced to 1 sentence.
 *  2 Essential    — top 2–3 tips, short-form, WITH the how. AI prose = short
 *                   paragraph (≤3 sentences). No extended "why" prose. (default)
 *  3 Hand-holding — everything, rebuilt as the illustrated dummies guide: the
 *                   extended personalised why, plain language, icons, numbered
 *                   steps, do/don't, timers.
 */
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { TIPS_LEVEL_MAX, type TipsLevel } from "@/lib/tipsLevel";
import { safeRewrite, stripDefinitionBrackets } from "@/lib/coherence";

/**
 * Wash-day stages, in the order they actually happen. Guidance is always
 * presented in this sequence — never priority order — so the user reads it the
 * way they will do it: before they start, cleanse, condition and heat, rinse
 * and seal, then style.
 */
export type GuidanceStage = "prep" | "cleanse" | "condition" | "seal" | "style";

export const STAGE_ORDER: GuidanceStage[] = ["prep", "cleanse", "condition", "seal", "style"];

export const STAGE_LABELS: Record<GuidanceStage, string> = {
  prep: "Before you start",
  cleanse: "Cleanse",
  condition: "Condition and heat",
  seal: "Rinse and seal",
  style: "Style and finish",
};

/** A single piece of guidance anywhere in the app. */
export interface GuidanceTip {
  /** Higher = more important. Lower levels keep the highest-priority items. */
  priority: number;
  /** Where in the wash day this belongs. Drives display order. */
  stage?: GuidanceStage;
  /** Short-form instruction — always shown at every level. */
  short: string;
  /** The extended reasoning — shown at level 3 (Hand-holding) only. */
  why?: string;
  /** Plain-English definition of a technical term — shown at level 3. */
  define?: string;
  /** Correct practice pairs — shown at level 3 only. */
  dos?: string[];
  /** Incorrect practice pairs — shown at level 3 only. */
  donts?: string[];
  /** Non-negotiable education (two-step cleanse, trim/retention). Never
   *  dropped by the level quantity cap — only its depth changes. */
  alwaysShow?: boolean;
}

/** Sort selected tips back into wash-day order for display. Stageless tips keep
 *  their incoming order and sit after the staged ones. */
export function orderByStage<T extends { stage?: GuidanceStage }>(tips: T[]): T[] {
  return [...tips]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ai = a.t.stage ? STAGE_ORDER.indexOf(a.t.stage) : STAGE_ORDER.length;
      const bi = b.t.stage ? STAGE_ORDER.indexOf(b.t.stage) : STAGE_ORDER.length;
      return ai - bi || a.i - b.i;
    })
    .map((e) => e.t);
}

/** Group tips into consecutive stage sections for headed rendering. */
export function groupByStage<T extends { stage?: GuidanceStage }>(
  tips: T[],
): Array<{ stage: GuidanceStage | null; label: string | null; items: T[] }> {
  const groups: Array<{ stage: GuidanceStage | null; label: string | null; items: T[] }> = [];
  for (const tip of orderByStage(tips)) {
    const stage = tip.stage ?? null;
    const last = groups[groups.length - 1];
    if (last && last.stage === stage) last.items.push(tip);
    else groups.push({ stage, label: stage ? STAGE_LABELS[stage] : null, items: [tip] });
  }
  return groups;
}

/** How many sentences of AI / editorial prose each level keeps. */
export const PROSE_SENTENCES: Record<TipsLevel, number> = {
  1: 1,
  2: 3,
  3: Number.POSITIVE_INFINITY,
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
 * verbosity the level allows. Level 3 additionally puts plain-English first for
 * technical terms.
 *
 * Condensing keeps the sentences that actually guide the user (action, cadence,
 * trigger) rather than blindly taking the first N sentences.
 */
export function condenseProse(text: string | null | undefined, level: TipsLevel): string {
  if (!text) return "";
  const raw = stripDefinitionBrackets(text.replace(/\s+/g, " ").trim());
  // The AI's words and capitalisation are never mutated at render.
  const clean = raw;
  // Same sentence twice is always noise, at every level.
  const unique = dedupeSentences(clean);
  if (level >= 3) {
    return safeRewrite(unique, plainLanguage(unique));
  }

  const max = PROSE_SENTENCES[level];
  if (!Number.isFinite(max)) return unique;
  return pickGuidance(splitSentences(unique), max).join(" ");

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
  3: Number.POSITIVE_INFINITY,
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
export const wantsBeginner = (level: TipsLevel) => level >= 3;

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

/* ------------------------------------------------------------------ *
 * ONE SENTENCE, ONCE — render-level sentence dedupe.
 *
 * Guidance for a single page is assembled from several sources (an alert, a
 * rhythm note, an AI tip, a next-wash focus). Any sentence that has already
 * been shown on that page is noise, so every renderer normalises sentences
 * (lowercase, punctuation stripped) and drops exact or near duplicates before
 * render.
 * ------------------------------------------------------------------ */

/** Comparison key for a sentence: lowercase, punctuation and spacing stripped. */
export const sentenceKey = (sentence: string) =>
  (sentence ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Drop repeated sentences from a block of prose. Pass a shared `seen` set to
 * dedupe across several blocks on the same page.
 */
export function dedupeSentences(
  text: string | null | undefined,
  seen: Set<string> = new Set(),
): string {
  if (!text) return "";
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const key = sentenceKey(sentence);
    if (key.length < 8) {
      kept.push(sentence);
      continue;
    }
    if (seen.has(key)) continue;
    // Near-duplicate: one sentence fully contains the other's wording.
    let duplicate = false;
    for (const prev of seen) {
      if (prev.includes(key) || key.includes(prev)) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;
    seen.add(key);
    kept.push(sentence);
  }
  return kept.join(" ").trim();
}

/**
 * HARD BLOCK BUDGET (renderer-side safety net).
 *
 * No rendered paragraph may run past two sentences / ~40 words. Longer AI text
 * is split at sentence boundaries into separate blocks — never truncated,
 * never hidden.
 */
export const MAX_BLOCK_SENTENCES = 2;
export const MAX_BLOCK_WORDS = 40;

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Split prose into render-sized paragraphs, each within the block budget. */
export function splitToBlocks(
  text: string | null | undefined,
  maxSentences = MAX_BLOCK_SENTENCES,
  maxWords = MAX_BLOCK_WORDS,
): string[] {
  const sentences = splitSentences(text ?? "");
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push(current.join(" "));
    current = [];
  };
  for (const sentence of sentences) {
    const projected = wordCount([...current, sentence].join(" "));
    if (current.length >= maxSentences || (current.length > 0 && projected > maxWords)) flush();
    current.push(sentence);
  }
  flush();
  return blocks.filter(Boolean);
}

/** Lead sentence + the rest, for lead-in bolding of a dense block. */
export function leadAndRest(text: string): { lead: string; rest: string } {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return { lead: text.trim(), rest: "" };
  return { lead: sentences[0], rest: sentences.slice(1).join(" ") };
}

/**
 * TWO-WEIGHT RULE (see also the guidance renderers).
 *
 * A block is only ever split into two weights when the AI's own punctuation
 * gives a REAL structural boundary — an em-dash or a colon near the start of
 * the string, e.g. "Buildup is settling on your scalp — it can restrict
 * follicles." There is NO arbitrary word-count cut, and the AI's words and
 * capitalisation are never altered: whatever is not emphasised is rendered
 * verbatim, starting exactly as the AI wrote it.
 *
 * With no boundary, the whole block renders in the emphasised weight. The
 * two-sentence / ~40-word block budget keeps that from becoming a wall of bold.
 */
export const EMPHASIS_BOUNDARY_LIMIT = 50;

export function emphasisSplit(text: string): { phrase: string; rest: string } {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { phrase: "", rest: "" };

  // Em-dash / en-dash boundary: the separator stays with the lighter remainder.
  const dash = clean.search(/\s[—–]\s/);
  if (dash > 0 && dash <= EMPHASIS_BOUNDARY_LIMIT) {
    const rest = clean.slice(dash + 1).trim();
    if (rest) return { phrase: clean.slice(0, dash).trim(), rest };
  }

  // Colon boundary: the colon belongs to the phrase it closes. Times ("9:30")
  // and URLs are not boundaries.
  const colon = clean.search(/:(?=\s)/);
  if (colon > 0 && colon <= EMPHASIS_BOUNDARY_LIMIT && !/\d$/.test(clean[colon - 1])) {
    const rest = clean.slice(colon + 1).trim();
    if (rest) return { phrase: clean.slice(0, colon + 1).trim(), rest };
  }

  return { phrase: clean, rest: "" };
}


