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
  source: "fetch" | "firecrawl" | "none";
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

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
    return { title: titleMatch ? titleMatch[1].trim() : "", text: htmlToText(html), source: "fetch" };
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
    const metadata = data?.metadata as { title?: string } | undefined;
    return { title: metadata?.title ?? "", text: markdown, source: "firecrawl" };
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
      if (scraped && scraped.text.length > (result?.text.length ?? 0)) result = scraped;
    }
  }
  return result ?? { title: "", text: "", source: "none" };
}
