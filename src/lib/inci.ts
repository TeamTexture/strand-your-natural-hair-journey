// INCI normalisation — must stay byte-for-byte in step with the edge function's
// `_shared/ingredient-copy.ts` normaliseInciKey, because the key it produces is
// the lookup key for the shared `ingredients` glossary table.
export function normaliseInciKey(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
