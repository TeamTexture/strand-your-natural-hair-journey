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

/**
 * Every key a single label name could legitimately match in the glossary.
 *
 * Labels sold in bilingual markets write one ingredient as several names at
 * once — "water/eau/aqua", "hippophae rhamnoides (sea buckthorn/argousier)
 * fruit/seed oil". The plain key for those strings matches nothing, so common
 * ingredients were being reported as "not in our glossary". Each slash group is
 * expanded into alternatives (and the parenthetical content is tried both
 * stripped and kept), so any one of the real names can resolve.
 *
 * Must stay in step with `_shared/ingredient-copy.ts`.
 */
export function inciKeyCandidates(name: string): string[] {
  const raw = (name ?? "").trim();
  if (!raw) return [];
  const out: string[] = [];
  const push = (v: string) => {
    const k = normaliseInciKey(v);
    if (k && !out.includes(k)) out.push(k);
  };

  push(raw);
  // Parenthetical common names are real names too ("(sea buckthorn)").
  const flattened = raw.replace(/[()]/g, " ");
  push(flattened);

  for (const source of [raw.replace(/\([^)]*\)/g, " "), flattened]) {
    const words = source.split(/\s+/).filter(Boolean);
    if (!words.some((w) => w.includes("/"))) continue;
    let variants: string[][] = [[]];
    for (const word of words) {
      const alts = word.split("/").map((a) => a.trim()).filter(Boolean);
      const next: string[][] = [];
      for (const v of variants) {
        for (const alt of alts) {
          if (next.length >= 12) break;
          next.push([...v, alt]);
        }
      }
      variants = next.length ? next : variants;
    }
    for (const v of variants.slice(0, 12)) {
      push(v.join(" "));
      // "water/eau/aqua" alone: each alternative is the whole name.
      if (v.length === 1) continue;
    }
  }
  return out.slice(0, 16);
}

