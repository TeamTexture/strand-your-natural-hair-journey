import { formatDistanceToNow } from "date-fns";

/**
 * One relative-time format for every community surface.
 * date-fns adds "about"/"almost"/"over" qualifiers on some spans and not
 * others, which read as two different formats. Strip them.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDistanceToNow(d, { addSuffix: true })
    .replace(/^(about|almost|over|less than)\s+/i, "")
    .replace(/^a /i, "1 ")
    .replace(/^an /i, "1 ");
}

/** Truncate at a word boundary — never mid-word — and add a single ellipsis. */
export function truncateWords(text: string, max = 34): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 8 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, "");
  return `${head}…`;
}

export type AuthorMetaLike = {
  goal_title?: string | null;
  current_style?: string | null;
};

/**
 * One metadata treatment everywhere: her own goal exactly as she wrote it
 * (cleanly truncated), then her current style. Never a leading separator,
 * and never a goal she does not hold.
 */
export function authorMetaLine(a: AuthorMetaLike | null | undefined): string | null {
  if (!a) return null;
  const parts: string[] = [];
  const goal = a.goal_title?.trim();
  if (goal) parts.push(`Goal: ${truncateWords(goal, 34)}`);
  const style = a.current_style?.trim();
  if (style) parts.push(`Current style: ${truncateWords(style, 26)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Initials for an avatar fallback — up to two letters, never a broken image. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const EMOJI_ONLY = /^(?:[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s])+$/u;

/** True when a comment body is nothing but emoji, so it can render larger. */
export function isEmojiOnly(body: string | null | undefined): boolean {
  const t = (body ?? "").trim();
  if (!t) return false;
  if (t.length > 24) return false;
  return EMOJI_ONLY.test(t) && /\p{Extended_Pictographic}/u.test(t);
}

/**
 * Prefix match for @-tagging: the start of the first name, the start of any
 * other word in the name, or the start of the handle. Never a substring match
 * anywhere in the string, and never an unfiltered tail of the member list.
 */
export function mentionMatchRank(label: string, query: string): number | null {
  const q = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return 0;
  const full = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (full === q) return 0;
  if (full.startsWith(q)) return 1;
  const words = full.split(" ");
  if (words.some((w) => w.startsWith(q))) return 2;
  const handle = full.replace(/[^a-z0-9]/g, "");
  if (handle.startsWith(q.replace(/[^a-z0-9]/g, ""))) return 3;
  return null;
}
