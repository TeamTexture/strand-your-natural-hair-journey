// Shared page retrieval for functions that read a caller-supplied product or
// supplement page. Same two-stage pipeline the product URL flow uses: plain
// fetch first (fast), Firecrawl as the fallback when the retailer blocks or
// JS-renders the page.

declare const Deno: { env: { get(key: string): string | undefined } };

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ScrapedPage {
  title: string;
  text: string;
  /** Hero/pack-shot image for the page, when one can be identified. */
  imageUrl: string | null;
  source: "fetch" | "firecrawl" | "none";
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Page chrome — flags, payment badges, logos, sprites — is never the hero
 *  product shot. Tested against the filename only (retailer CDN directories
 *  routinely contain words like "icon"). Mirrors product-analyse-url. */
const CHROME_RE =
  /(union[-_]?jack|\bicon\b|^icons?[-_.]|[-_]icon[-_.]|logo|sprite|payment|visa|mastercard|amex|paypal|klarna|applepay|gpay|trustpilot|placeholder|spinner|loader|1x1|blank|transparent|burger|chevron)/i;

const toHttps = (u: string | null | undefined): string | null =>
  !u ? null : u.startsWith("http://") ? "https://" + u.slice("http://".length) : u;

function isLikelyProductImage(u: string | null | undefined): boolean {
  if (!u) return false;
  if (/^data:/i.test(u)) return false;
  const file = (u.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "");
  if (/\.(svg|gif)$/i.test(file)) return false;
  if (CHROME_RE.test(file)) return false;
  return true;
}

/** Extract the page's primary product image from raw HTML. Structured product
 *  data outranks social metadata, then og:image:secure_url > og:image >
 *  twitter:image, then the first non-chrome inline image in the main content. */
export function extractPageImage(html: string): string | null {
  const catalogImage = html.match(/["']productImageURL["']\s*:\s*["']([^"']+)["']/i)?.[1];
  if (isLikelyProductImage(catalogImage)) return toHttps(catalogImage);

  const jsonLd = html.match(/"image"\s*:\s*(?:\[\s*)?["'](https?:\/\/[^"']+)["']/i)?.[1];
  if (isLikelyProductImage(jsonLd)) return toHttps(jsonLd);

  const found: Array<{ kind: "secure" | "og" | "twitter"; url: string }> = [];
  const patterns: Array<{ re: RegExp; kindIdx: number; urlIdx: number }> = [
    { re: /<meta\s+(?:property|name)=["'](og:image:secure_url|og:image|twitter:image)["']\s+content=["']([^"']+)["']/gi, kindIdx: 1, urlIdx: 2 },
    { re: /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](og:image:secure_url|og:image|twitter:image)["']/gi, kindIdx: 2, urlIdx: 1 },
  ];
  for (const { re, kindIdx, urlIdx } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const tag = m[kindIdx];
      const url = m[urlIdx];
      if (!url) continue;
      found.push({
        kind: tag === "og:image:secure_url" ? "secure" : tag === "og:image" ? "og" : "twitter",
        url,
      });
    }
  }
  const pick = (list: typeof found): string | null => {
    const usable = list.filter((f) => isLikelyProductImage(f.url));
    return toHttps(usable.find((f) => f.url.startsWith("https://"))?.url ?? usable[0]?.url ?? null);
  };
  for (const kind of ["secure", "og", "twitter"] as const) {
    const hit = pick(found.filter((f) => f.kind === kind));
    if (hit) return hit;
  }

  const container = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  const scope = container ? container[1] : html;
  const marked = scope.match(/<img[^>]+(?:data-product-image|itemprop=["']image["'])[^>]*src=["']([^"']+)["']/i);
  if (marked && isLikelyProductImage(marked[1])) return toHttps(marked[1]);
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(scope)) !== null) {
    if (/^https?:\/\//i.test(m[1]) && isLikelyProductImage(m[1])) return toHttps(m[1]);
  }
  return null;
}

function firstMarkdownImage(md: string): string | null {
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (isLikelyProductImage(m[1])) return toHttps(m[1]);
  }
  return null;
}


async function plainFetch(url: string): Promise<ScrapedPage | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-GB,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      title: titleMatch ? titleMatch[1].trim() : "",
      text: htmlToText(html),
      imageUrl: extractPageImage(html),
      source: "fetch",
    };
  } catch (e) {
    console.error("[page-scrape] plain fetch failed", e);
    return null;
  }
}

async function firecrawl(url: string, apiKey: string): Promise<ScrapedPage | null> {
  try {
    const resp = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 400 }),
      signal: AbortSignal.timeout(18_000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const data = (j?.data ?? j) as Record<string, unknown> | undefined;
    const markdown = data?.markdown as string | undefined;
    if (!markdown) return null;
    const metadata = data?.metadata as
      | { title?: string; ogImage?: string; "og:image"?: string; image?: string }
      | undefined;
    const meta = [metadata?.ogImage, metadata?.["og:image"], metadata?.image].find((c) =>
      isLikelyProductImage(c),
    );
    return {
      title: metadata?.title ?? "",
      text: markdown,
      imageUrl: toHttps(meta ?? null) ?? firstMarkdownImage(markdown),
      source: "firecrawl",
    };
  } catch (e) {
    console.error("[page-scrape] firecrawl failed", e);
    return null;
  }
}

const looksBlocked = (text: string) =>
  text.length < 600 ||
  /automated access|enter the characters you see|robot check|access denied|are you a human/i.test(
    text.slice(0, 4000),
  );

/** Fetch a page and return its readable text, or `source: "none"` when unreachable. */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  let result = await plainFetch(url);
  if (!result || looksBlocked(result.text)) {
    const key = Deno.env.get("FIRECRAWL_API_KEY");
    if (key) {
      const scraped = await firecrawl(url, key);
      if (scraped && scraped.text.length > (result?.text.length ?? 0)) {
        result = { ...scraped, imageUrl: scraped.imageUrl ?? result?.imageUrl ?? null };
      }
    }
  }
  return result ?? { title: "", text: "", imageUrl: null, source: "none" };
}

