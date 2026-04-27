// Defense-in-depth: strip ANY model-emitted book citation from output text.
//
// The model is instructed never to write a chapter / page / "Read more —"
// citation (see strand-persona.ts). This sanitizer removes them anyway, so
// a hallucinated chapter ("Chapter 4: The Truth About Deep Conditioners"
// — which doesn't exist) physically cannot reach the user.
//
// Real, verified citations are appended SERVER-SIDE elsewhere using rows
// from `manuscript_chunks` (see _shared/rag.ts and _shared/knowledge/index.ts).

const PATTERNS: RegExp[] = [
  // "Read more — How To Love Your Afro, …" (anywhere in a line)
  /^[\s>*\-•]*read\s*more[\s\S]*?how\s*to\s*love\s*your\s*afro.*$/gim,
  // Standalone "How To Love Your Afro, Chapter X…"
  /^[\s>*\-•]*how\s*to\s*love\s*your\s*afro[^\n]*chapter[^\n]*$/gim,
  // Inline "(How To Love Your Afro, Chapter X, p.Y)"
  /\(\s*how\s*to\s*love\s*your\s*afro[^)]*chapter[^)]*\)/gi,
  // "— Chapter 4: The Truth About …" style trailing bylines
  /\s*[—–-]\s*chapter\s+\d+[^\n]*p\.\s*\d+[^\n]*$/gim,
  // Bare "Chapter X: Some Title, p.Y" lines
  /^[\s>*\-•]*chapter\s+\d+\s*:[^\n]*p\.\s*\d+[^\n]*$/gim,
];

/** Remove any model-emitted citation/chapter-reference noise from a string. */
export function stripModelCitations(text: string | null | undefined): string {
  if (!text) return "";
  let out = String(text);
  for (const re of PATTERNS) out = out.replace(re, "");
  // Collapse the blank lines we just created.
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip citations from every string in an array (e.g. bullet lists). */
export function stripModelCitationsArray(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((s) => stripModelCitations(typeof s === "string" ? s : ""))
    .filter((s) => s.length > 0);
}

/**
 * Recursively strip citations from every string field in a JSON-like object.
 * Handy for AI responses that have nested `summary`, `bullets`, `tips`, etc.
 */
export function stripModelCitationsDeep<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") {
    return stripModelCitations(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripModelCitationsDeep(v)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripModelCitationsDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}
