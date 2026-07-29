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

/**
 * Trim any block of prose (AI summary, explanation, marker overview) to the
 * verbosity the level allows. Level 4 additionally puts plain-English first for
 * technical terms.
 */
export function condenseProse(text: string | null | undefined, level: TipsLevel): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (level >= 4) return plainLanguage(clean);
  const max = PROSE_SENTENCES[level];
  if (!Number.isFinite(max)) return clean;
  return splitSentences(clean).slice(0, max).join(" ");
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
