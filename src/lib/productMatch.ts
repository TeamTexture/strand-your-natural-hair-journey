// DETERMINISTIC PRODUCT MENTION RESOLUTION
//
// AI advice is never trusted to tag its own product mentions. The model writes
// prose; this module scans the finished text against the user's shelf and
// reports the spans that resolve to a real `user_products` row.
//
// Rules (see also src/lib/smartInline.tsx which renders the matches):
//  - only shelf rows (`on_shelf = true`) for the current user are matchable
//  - both sides are normalised: lowercase, diacritics stripped, ™ ® © removed,
//    parenthetical suffixes dropped, whitespace collapsed
//  - candidates are "brand + name" and "name" alone
//  - longest match wins; ambiguous matches (two different products) are left
//    as plain text
//  - a mention with no shelf match stays plain text. Nothing is ever created.

export interface MatchableProduct {
  id: string;
  product_key: string;
  name: string;
  brand?: string | null;
  on_shelf?: boolean | null;
}

export interface ProductMention {
  /** Offsets into the ORIGINAL text. */
  start: number;
  end: number;
  /** The original text of the mention, rendered as the link label. */
  text: string;
  product: MatchableProduct;
}

const TRADEMARKS = /[™®©]/g;

/** Drops "(Sulfate-Free)" / "[intense mask]" style suffixes and clarifiers. */
export const stripParentheticals = (raw: string) =>
  String(raw ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");

/** lowercase + de-accent + de-trademark + collapse whitespace. */
export const normaliseProductText = (raw: string) =>
  String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(TRADEMARKS, "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Normalises `text` while keeping a map back to the original offsets, so a hit
 * in normalised space can be rendered against the original characters.
 */
function normaliseWithMap(text: string) {
  let out = "";
  const map: number[] = [];
  let lastWasSpace = true; // suppress leading whitespace
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const decomposed = ch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(TRADEMARKS, "")
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'");
    if (!decomposed) continue;
    if (/\s/.test(decomposed)) {
      if (lastWasSpace) continue;
      out += " ";
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    lastWasSpace = false;
    for (const c of decomposed) {
      out += c;
      map.push(i);
    }
  }
  return { normalised: out, map };
}

const isWordChar = (ch: string | undefined) => Boolean(ch && /[a-z0-9]/i.test(ch));

/** All the normalised phrases that should resolve to a given product. */
export function candidatePhrases(p: MatchableProduct): string[] {
  const name = p.name ?? "";
  const brand = p.brand ?? "";
  const variants = [
    `${brand} ${name}`,
    name,
    stripParentheticals(`${brand} ${name}`),
    stripParentheticals(name),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const n = normaliseProductText(v);
    if (n.length < 6) continue; // too short to be a safe mention
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Finds every shelf-product mention in `text`. Non-overlapping, longest first,
 * ambiguous phrases dropped.
 */
export function findProductMentions(
  text: string,
  products: MatchableProduct[],
): ProductMention[] {
  if (!text) return [];
  const shelf = products.filter((p) => p.on_shelf !== false && p.name?.trim());
  if (shelf.length === 0) return [];

  // phrase -> products that claim it. A phrase claimed by two different
  // products is ambiguous and never linked.
  const byPhrase = new Map<string, MatchableProduct[]>();
  for (const p of shelf) {
    for (const phrase of candidatePhrases(p)) {
      const list = byPhrase.get(phrase) ?? [];
      if (!list.some((x) => x.id === p.id)) list.push(p);
      byPhrase.set(phrase, list);
    }
  }

  const { normalised, map } = normaliseWithMap(text);
  const phrases = [...byPhrase.keys()].sort((a, b) => b.length - a.length);

  const mentions: ProductMention[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) =>
    taken.some(([ts, te]) => !(e <= ts || s >= te));
  const linkedProducts = new Set<string>();

  for (const phrase of phrases) {
    const owners = byPhrase.get(phrase)!;
    if (owners.length !== 1) continue; // ambiguous — leave as plain text
    const product = owners[0];
    let from = 0;
    for (;;) {
      const idx = normalised.indexOf(phrase, from);
      if (idx === -1) break;
      const end = idx + phrase.length;
      from = end;
      // whole-word boundaries
      if (isWordChar(normalised[idx - 1]) || isWordChar(normalised[end])) continue;
      if (overlaps(idx, end)) continue;
      taken.push([idx, end]);
      // FIRST OCCURRENCE ONLY per product — repeated chips read as noise.
      if (linkedProducts.has(product.id)) continue;
      linkedProducts.add(product.id);
      const startOrig = map[idx];
      const endOrig = (map[end - 1] ?? startOrig) + 1;
      mentions.push({
        start: startOrig,
        end: endOrig,
        text: text.slice(startOrig, endOrig),
        product,
      });
    }
  }

  return mentions.sort((a, b) => a.start - b.start);
}

/** Canonical in-app route for a shelf product row. */
export function productHref(p: MatchableProduct) {
  const params = new URLSearchParams({
    key: p.product_key,
    name: p.name,
    brand: p.brand ?? "",
  });
  return `/products/ingredient?${params.toString()}`;
}
