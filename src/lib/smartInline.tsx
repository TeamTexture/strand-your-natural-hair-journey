// Shared inline renderer for AI-generated advice copy.
//
// Wherever the app displays AI text, product names, brand names, ingredient
// names, and "TT Heat Hat" must be hyperlinked to their respective in-app
// pages (or www.teamtexture.co.uk for the heat hat). Raw URLs to Team
// Texture are stripped so we never leak a bare link into UI copy.
//
// Consumers use the `useSmartInline()` hook to get a `renderInline(text, key)`
// function scoped to the current user's product shelf/wishlist, so brand and
// ingredient links only fire for things the user actually has on their shelf.

import React from "react";
import { Link } from "react-router-dom";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";

export const TEAM_TEXTURE_URL = "https://www.teamtexture.co.uk";

/** Strip parenthetical / trailing raw teamtexture URLs and normalise
 *  common "heat hat"-alike phrases into a canonical "TT Heat Hat". */
export const normaliseHeatLanguage = (raw: string) => {
  let t = String(raw ?? "");
  // Strip explicit markdown links / parentheticals pointing at Team Texture.
  t = t.replace(/\[\s*TT\s+Heat\s+Hat\s*\]\(\s*(?:https?:\/\/)?(?:www\.)?teamtexture\.co\.uk\/?\s*\)/gi, "TT Heat Hat");
  t = t.replace(/TT\s+Heat\s+Hat\s*\(\s*(?:https?:\/\/)?(?:www\.)?teamtexture\.co\.uk\/?\s*\)/gi, "TT Heat Hat");
  // Strip bare URL mentions so the anchor below is the only link.
  t = t.replace(/\s*\(https?:\/\/(?:www\.)?teamtexture\.co\.uk[^)]*\)/gi, "");
  t = t.replace(/\s*—\s*https?:\/\/(?:www\.)?teamtexture\.co\.uk\S*/gi, "");
  t = t.replace(/(?:https?:\/\/)?(?:www\.)?teamtexture\.co\.uk\/?/gi, "TT Heat Hat");
  // Any generic heat/plastic/steamer language becomes the TT Heat Hat.
  t = t.replace(
    /\b(?:a\s+|the\s+)?(?:generic\s+)?(?:heat\s*hat|heat\s*aht|heated\s+cap|heat\s+cap|thermal\s+cap|deep-conditioning\s+cap|deep\s+conditioning\s+cap|plastic\s+cap|shower\s+cap|warm\s+towel|steamer|steamers)\b/gi,
    "the TT Heat Hat",
  );
  t = t.replace(/\b(?:the\s+)?TT\s+Heat\s+Hat\s+(?:TT\s+Heat\s+Hat\s*)+/gi, "the TT Heat Hat");
  t = t.replace(/\bthe\s+the\s+TT\s+Heat\s+Hat\b/gi, "the TT Heat Hat");
  return t.replace(/[ \t]{2,}/g, " ");
};

type Match = {
  start: number;
  end: number;
  kind: "bold" | "product" | "brand" | "ingredient" | "heat" | "mdLink";
  text: string;
  product?: UserProduct;
  href?: string;
};

const LINK_CLS =
  "text-primary font-medium underline decoration-primary/50 decoration-1 underline-offset-2 hover:decoration-primary transition";

/** Renders a line of AI copy with links + bold, using the given product shelf. */
export function renderInlineWithProducts(
  line: string,
  keyPrefix: string,
  products: UserProduct[],
): React.ReactNode[] {
  const safeLine = normaliseHeatLanguage(line).replace(/\*\*([^*]+)\*\*/g, "$1");

  const matches: Match[] = [];
  const hasOverlap = (start: number, end: number) =>
    matches.some((x) => !(end <= x.start || start >= x.end));

  const addRegexMatches = (
    re: RegExp,
    factory: (text: string) => Omit<Match, "start" | "end" | "text">,
  ) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(safeLine))) {
      const start = m.index;
      const end = start + m[0].length;
      if (hasOverlap(start, end)) {
        if (m[0].length === 0) re.lastIndex += 1;
        continue;
      }
      matches.push({ start, end, text: m[0], ...factory(m[0]) });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  };

  // 1. Markdown links `[label](href)` — highest priority so the AI can be explicit.
  const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[\w\-/?=&%#.]+)\)/g;
  let md: RegExpExecArray | null;
  while ((md = mdRe.exec(safeLine))) {
    matches.push({
      start: md.index,
      end: md.index + md[0].length,
      kind: "mdLink",
      text: md[1],
      href: md[2],
    });
  }

  // 2. Product names — longest first for greedy matches.
  const sorted = [...products]
    .filter((p) => p.name && p.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexMatches(new RegExp(`\\b${escaped}\\b`, "gi"), () => ({
      kind: "product",
      product: p,
    }));
  }

  // 3. Brands seen on shelf/wishlist.
  const brands = Array.from(
    new Set(
      products
        .map((p) => p.brand?.trim())
        .filter((b): b is string => Boolean(b && b.length >= 2)),
    ),
  ).sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexMatches(new RegExp(`\\b${escaped}\\b`, "gi"), () => ({
      kind: "brand",
      href: `/products/brand/${encodeURIComponent(brand)}`,
    }));
  }

  // 4. Ingredients seen anywhere on shelf/wishlist.
  const ingredients = Array.from(
    new Set(
      products
        .flatMap((p) => [
          ...(p.ingredients ?? []),
          ...(p.key_ingredients ?? []).map((i) => i.name),
        ])
        .map((i) => i?.trim())
        .filter((i): i is string => Boolean(i && i.length >= 4)),
    ),
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 250);
  for (const ingredient of ingredients) {
    const escaped = ingredient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexMatches(new RegExp(`\\b${escaped}\\b`, "gi"), () => ({
      kind: "ingredient",
      href: `/products/ingredient-research?ingredient=${encodeURIComponent(ingredient)}`,
    }));
  }

  // 5. TT Heat Hat — always links to teamtexture.co.uk.
  addRegexMatches(/\bTT\s+Heat\s+Hat\b/gi, () => ({
    kind: "heat",
    href: TEAM_TEXTURE_URL,
  }));

  // 6. Bold **text** — lowest priority, only where nothing else matched.
  const boldRe = /\*\*([^*]+)\*\*/g;
  let bm: RegExpExecArray | null;
  while ((bm = boldRe.exec(safeLine))) {
    const start = bm.index;
    const end = start + bm[0].length;
    if (hasOverlap(start, end)) continue;
    matches.push({ start, end, kind: "bold", text: bm[1] });
  }

  matches.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<span key={`${keyPrefix}-t-${i}`}>{safeLine.slice(cursor, m.start)}</span>);
    }
    if (m.kind === "mdLink") {
      const isExternal = /^https?:\/\//i.test(m.href ?? "");
      nodes.push(
        isExternal ? (
          <a key={`${keyPrefix}-md-${i}`} href={m.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
            {m.text}
          </a>
        ) : (
          <Link key={`${keyPrefix}-md-${i}`} to={m.href ?? "#"} className={LINK_CLS}>
            {m.text}
          </Link>
        ),
      );
    } else if (m.kind === "product" && m.product) {
      nodes.push(
        <Link key={`${keyPrefix}-p-${i}`} to={`/products/profile/${m.product.id}`} className={LINK_CLS}>
          {m.text}
        </Link>,
      );
    } else if (m.kind === "brand" || m.kind === "ingredient") {
      nodes.push(
        <Link key={`${keyPrefix}-${m.kind}-${i}`} to={m.href ?? "#"} className={LINK_CLS}>
          {m.text}
        </Link>,
      );
    } else if (m.kind === "heat") {
      nodes.push(
        <a
          key={`${keyPrefix}-heat-${i}`}
          href={TEAM_TEXTURE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLS}
        >
          TT Heat Hat
        </a>,
      );
    } else {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-foreground">
          {m.text}
        </strong>,
      );
    }
    cursor = m.end;
  });
  if (cursor < safeLine.length) {
    nodes.push(<span key={`${keyPrefix}-t-end`}>{safeLine.slice(cursor)}</span>);
  }
  return nodes;
}

/** Hook that yields a `renderInline(text, key)` bound to the current user's shelf. */
export function useSmartInline() {
  const { products } = useUserProducts("all");
  return React.useCallback(
    (text: string, keyPrefix = "s") => renderInlineWithProducts(text, keyPrefix, products),
    [products],
  );
}
