// Deterministic topical sensitivity matcher.
//
// Runs on plaintext held in the browser (the member's own decrypted data) and
// on the product's declared ingredient list. Word-boundary matching only, so
// "coco" never fires on "chocolate".

import {
  matchTermsFor,
  type SensitivityEntry,
  type SensitivityScope,
} from "@/lib/sensitivityVocab";

export interface SensitivityHit {
  entry: SensitivityEntry;
  /** The term that matched, as written in the source text. */
  term: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escape(term)}([^a-z0-9]|$)`, "i");
  return re.test(haystack);
}

/**
 * Scan free text (an ingredient list, meal name, ingredient line) for the
 * member's sensitivities. Returns one hit per matching entry, highest
 * severity first.
 */
export function scanSensitivities(
  text: string | string[] | null | undefined,
  entries: SensitivityEntry[],
  scope: SensitivityScope,
  opts?: { severities?: SensitivityEntry["severity"][] },
): SensitivityHit[] {
  if (!text || entries.length === 0) return [];
  const haystack = (Array.isArray(text) ? text.join(" , ") : text).toLowerCase();
  if (!haystack.trim()) return [];
  const allowed = opts?.severities;
  const hits: SensitivityHit[] = [];
  for (const entry of entries) {
    if (allowed && !allowed.includes(entry.severity)) continue;
    const terms = matchTermsFor(scope, entry);
    const found = terms.find((t) => containsTerm(haystack, t));
    if (found) hits.push({ entry, term: found });
  }
  const rank = { avoid: 0, limit: 1, dislike: 2 } as const;
  return hits.sort((a, b) => rank[a.entry.severity] - rank[b.entry.severity]);
}

/** True when a hard "avoid completely" entry appears in the text. */
export function hasHardTopicalHit(
  text: string | string[] | null | undefined,
  entries: SensitivityEntry[],
): boolean {
  return scanSensitivities(text, entries, "topical", { severities: ["avoid"] }).length > 0;
}
