// Lightweight product enrichment for MCP write tools.
// Goal: when Claude adds a product to the shelf/wishlist, populate the same
// thumbnail fields (image_url, source_url) that in-app scans populate, so the
// row renders identically in Products.tsx and Home shelf thumbnails.
//
// Two channels, tried in order:
//   1. If Claude supplied a source_url  → fetch page HTML, extract og:image.
//   2. Otherwise, if FIRECRAWL_API_KEY   → search "brand name", take the top
//      result URL, then extract og:image from that URL.
//
// Bounded latency: 6s per HTTP fetch, 10s for the Firecrawl search. Failures
// are swallowed — enrichment is best-effort, the row is still created.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function toHttps(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.startsWith("http://") ? "https://" + u.slice("http://".length) : u;
}

function extractOgImage(html: string): string | null {
  const found: Array<{ kind: "secure" | "og" | "twitter"; url: string }> = [];
  const patterns: Array<{ re: RegExp; kindIdx: number; urlIdx: number }> = [
    {
      re: /<meta\s+(?:property|name)=["'](og:image:secure_url|og:image|twitter:image)["']\s+content=["']([^"']+)["']/gi,
      kindIdx: 1,
      urlIdx: 2,
    },
    {
      re: /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](og:image:secure_url|og:image|twitter:image)["']/gi,
      kindIdx: 2,
      urlIdx: 1,
    },
  ];
  for (const { re, kindIdx, urlIdx } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const tag = m[kindIdx];
      const url = m[urlIdx];
      if (!url) continue;
      const kind =
        tag === "og:image:secure_url" ? "secure" : tag === "og:image" ? "og" : "twitter";
      found.push({ kind, url });
    }
  }
  const pickHttps = (list: typeof found): string | null => {
    const https = list.find((f) => f.url.startsWith("https://"))?.url;
    if (https) return https;
    return toHttps(list[0]?.url ?? null);
  };
  const secure = pickHttps(found.filter((f) => f.kind === "secure"));
  if (secure) return secure;
  const og = pickHttps(found.filter((f) => f.kind === "og"));
  if (og) return og;
  const tw = pickHttps(found.filter((f) => f.kind === "twitter"));
  if (tw) return tw;
  return null;
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
    });
    if (!resp.ok) return null;
    return extractOgImage(await resp.text());
  } catch {
    return null;
  }
}

/** Firecrawl v2 search — returns the top result URL for a query. */
async function firecrawlSearchTopUrl(query: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 3 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as {
      data?: { web?: Array<{ url?: string }>; results?: Array<{ url?: string }> };
    };
    const web = body?.data?.web ?? body?.data?.results ?? [];
    for (const r of web) {
      const u = r?.url;
      if (u && /^https?:\/\//i.test(u)) return u;
    }
    return null;
  } catch {
    return null;
  }
}

export interface EnrichInput {
  name: string;
  brand?: string | null;
  source_url?: string | null;
}

export interface EnrichResult {
  image_url: string | null;
  source_url: string | null;
}

export async function enrichProduct(input: EnrichInput): Promise<EnrichResult> {
  // Channel 1: caller-supplied URL.
  if (input.source_url) {
    const img = await fetchOgImage(input.source_url);
    return { image_url: img, source_url: input.source_url };
  }
  // Channel 2: Firecrawl search fallback.
  const query = [input.brand ?? "", input.name].filter(Boolean).join(" ").trim();
  if (!query) return { image_url: null, source_url: null };
  const topUrl = await firecrawlSearchTopUrl(query);
  if (!topUrl) return { image_url: null, source_url: null };
  const img = await fetchOgImage(topUrl);
  return { image_url: img, source_url: topUrl };
}
