// Scrape a webpage (or Google Images results page, or a direct image URL) and
// return a list of image URLs the user can add to their mood board.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const MAX_IMAGES = 40;

const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|avif|heic|heif)(\?.*)?$/i;
const PINTEREST_HOST_RE = /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i;
const PINTEREST_PIN_RE = /\/pin\/(\d+)/i;

function isPinterestUrl(url: URL): boolean {
  return PINTEREST_HOST_RE.test(url.hostname.toLowerCase());
}

function isLikelyImage(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return false;
  if (IMG_EXT_RE.test(url)) return true;
  // Common CDN patterns without an extension
  if (/(images|img|cdn|media|photo|assets)\./i.test(url)) return true;
  return false;
}

async function isRemoteImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    return res.ok && contentType.startsWith("image/");
  } catch {
    return false;
  }
}

async function detectRemoteImage(url: string): Promise<boolean> {
  if (await isRemoteImage(url)) return true;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
        Accept: "image/*,*/*;q=0.8",
        Range: "bytes=0-0",
      },
    });
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    await res.body?.cancel().catch(() => undefined);
    return res.ok && contentType.startsWith("image/");
  } catch {
    return false;
  }
}

function toAbsolute(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function extractImgUrls(html: string, base: string): string[] {
  const found = new Set<string>();

  // <img src="..." srcset="...">
  const imgRe = /<img\b[^>]*?>/gi;
  const attrRe = /(?:src|data-src|data-original|data-lazy-src|srcset)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  const bgRe = /background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi;

  const pushCandidate = (raw: string) => {
    if (!raw) return;
    // srcset entries look like: "url 1x, url2 2x". Grab urls only.
    const parts = raw.split(",").map((p) => p.trim().split(/\s+/)[0]);
    for (const p of parts) {
      const abs = toAbsolute(p, base);
      if (abs && isLikelyImage(abs)) found.add(abs);
    }
  };

  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    let a: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(tag))) {
      pushCandidate(a[1] ?? a[2] ?? "");
    }
  }

  // background-image urls
  while ((m = bgRe.exec(html))) {
    pushCandidate(m[2]);
  }

  // og:image / twitter:image
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
  while ((m = metaRe.exec(html))) {
    pushCandidate(m[1]);
  }

  return Array.from(found);
}

async function resolvePinterestUrl(input: URL): Promise<string> {
  // Short pin.it links redirect to a full pinterest URL. Resolve them server-side
  // before calling Pinterest oEmbed.
  if (input.hostname.toLowerCase() !== "pin.it") return input.toString();

  let current = input.toString();
  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const location = res.headers.get("location");
    if (!location) return res.url || current;
    current = new URL(location, current).toString();
    const next = new URL(current);
    const host = next.hostname.toLowerCase();
    if (PINTEREST_PIN_RE.test(next.pathname)) return current;
    if (host !== "pin.it" && host !== "api.pinterest.com") return current;
  }
  return current;
}

function normalisePinterestPinUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const pinMatch = parsed.pathname.match(PINTEREST_PIN_RE);
    if (pinMatch?.[1]) return `https://www.pinterest.com/pin/${pinMatch[1]}/`;
  } catch {
    // Fall through to returning the original string.
  }
  return raw;
}

async function scrapePinterestPage(pinUrl: URL): Promise<string[]> {
  try {
    const res = await fetch(pinUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return [];
    const html = await res.text();
    return extractImgUrls(html, res.url || pinUrl.toString());
  } catch {
    return [];
  }
}

async function scrapePinterestPin(target: URL): Promise<{ source: string; images: string[] } | null> {
  const resolved = normalisePinterestPinUrl(await resolvePinterestUrl(target));
  const pinUrl = new URL(resolved);

  // Pinterest exposes a public oEmbed endpoint for pins. It is far more stable
  // than page scraping and avoids Firecrawl's Pinterest block.
  const oembed = new URL("https://www.pinterest.com/oembed.json");
  oembed.searchParams.set("url", pinUrl.toString());

  const res = await fetch(oembed.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    console.error("Pinterest oEmbed failed", res.status, await res.text().catch(() => ""));
    const fallback = await scrapePinterestPage(pinUrl);
    return fallback.length ? { source: pinUrl.toString(), images: fallback.slice(0, MAX_IMAGES) } : null;
  }

  const payload = await res.json().catch(() => null) as {
    thumbnail_url?: string;
    url?: string;
    html?: string;
  } | null;
  if (!payload) return null;

  const images = new Set<string>();
  if (payload.thumbnail_url && isLikelyImage(payload.thumbnail_url)) images.add(payload.thumbnail_url);
  if (payload.url && isLikelyImage(payload.url)) images.add(payload.url);
  if (payload.html) {
    for (const img of extractImgUrls(payload.html, pinUrl.toString())) images.add(img);
  }

  if (images.size === 0) {
    for (const img of await scrapePinterestPage(pinUrl)) images.add(img);
  }

  return { source: pinUrl.toString(), images: Array.from(images).slice(0, MAX_IMAGES) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { url } = (await req.json().catch(() => ({}))) as { url?: string };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise + basic validation
    let target: URL;
    try {
      target = new URL(url.trim());
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^https?:$/.test(target.protocol)) {
      return new Response(JSON.stringify({ error: "URL must be http(s)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Direct image URL? Skip scraping — just echo it back.
    if (isLikelyImage(target.toString()) || await detectRemoteImage(target.toString())) {
      return new Response(
        JSON.stringify({ source: target.toString(), images: [target.toString()] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isPinterestUrl(target)) {
      const pinterest = await scrapePinterestPin(target);
      if (pinterest?.images.length) {
        return new Response(JSON.stringify(pinterest), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ source: target.toString(), images: [], error: "We couldn't read that Pin. Try copying the image address from the Pin and paste that instead." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: target.toString(),
        formats: ["html", "rawHtml", "links"],
        onlyMainContent: false,
        waitFor: 1500,
      }),
    });

    const payload = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok || !payload) {
      const errBody = payload ? JSON.stringify(payload) : await res.text().catch(() => "");
      console.error("Firecrawl scrape failed", res.status, errBody);
      if (await detectRemoteImage(target.toString())) {
        return new Response(
          JSON.stringify({ source: target.toString(), images: [target.toString()] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ source: target.toString(), images: [], error: "We couldn't read that page. Try copying the image address and paste that instead.", status: res.status, details: errBody }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Firecrawl v2 may return fields at top level or under `data`.
    type Doc = { html?: string; rawHtml?: string; links?: unknown; metadata?: { sourceURL?: string } };
    const doc: Doc = (payload.data as Doc | undefined) ?? (payload as Doc);
    const html: string = (doc.html ?? doc.rawHtml ?? "") as string;
    const source = doc.metadata?.sourceURL ?? target.toString();

    const images = extractImgUrls(html, source);

    // Also include http(s) entries from the `links` array that look like images.
    if (Array.isArray(doc.links)) {
      for (const l of doc.links as unknown[]) {
        if (typeof l === "string" && isLikelyImage(l)) images.push(l);
      }
    }

    // Dedupe + cap
    const unique = Array.from(new Set(images)).slice(0, MAX_IMAGES);

    return new Response(
      JSON.stringify({ source, images: unique }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("moodboard-scrape-url error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
