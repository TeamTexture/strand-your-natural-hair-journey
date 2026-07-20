// Fetch a remote image server-side and add it to a mood board.
// Bypasses browser CORS and hotlink restrictions.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const BUCKET = "moodboard-images";
const MAX_BYTES = 12 * 1024 * 1024; // 12MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const PINTEREST_HOST_RE = /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i;
const PINTEREST_PIN_RE = /\/pin\/(\d+)/i;

function extForType(type: string): string {
  switch (type) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/avif": return "avif";
    default: return "jpg";
  }
}

function isPinterestUrl(url: URL): boolean {
  return PINTEREST_HOST_RE.test(url.hostname.toLowerCase());
}

function isLikelyImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(url) || /(images|img|cdn|media|photo|assets)\./i.test(url);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function maybePinterestOriginal(url: string): string[] {
  const out = [url];
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("pinimg.com")) {
      const original = parsed.toString().replace(/\/\d+x\//, "/originals/");
      if (original !== url) out.unshift(original);
    }
  } catch {
    // Ignore malformed candidate variants.
  }
  return out;
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
  const imgRe = /<img\b[^>]*?>/gi;
  const attrRe = /(?:src|data-src|data-original|data-lazy-src|srcset)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  const metaTagRe = /<meta\b[^>]*>/gi;
  const metaAttrRe = /(property|name|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const push = (raw: string) => {
    const parts = decodeHtml(raw).split(",").map((p) => p.trim().split(/\s+/)[0]);
    for (const part of parts) {
      const abs = toAbsolute(part, base);
      if (abs && isLikelyImage(abs)) {
        for (const candidate of maybePinterestOriginal(abs)) found.add(candidate);
      }
    }
  };
  let match: RegExpExecArray | null;
  while ((match = metaTagRe.exec(html))) {
    const attrs: Record<string, string> = {};
    let attr: RegExpExecArray | null;
    metaAttrRe.lastIndex = 0;
    while ((attr = metaAttrRe.exec(match[0]))) attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? "";
    const kind = (attrs.property || attrs.name || "").toLowerCase();
    if ((kind === "og:image" || kind === "og:image:url" || kind === "twitter:image") && attrs.content) {
      push(attrs.content);
    }
  }
  while ((match = imgRe.exec(html))) {
    const tag = match[0];
    let attr: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((attr = attrRe.exec(tag))) push(attr[1] ?? attr[2] ?? "");
  }

  // Pinterest and Google often hydrate image data inside JSON rather than tags.
  const escapedImageRe = /https?:\\\/\\\/[^"'\\]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^"'\\]*)?/gi;
  while ((match = escapedImageRe.exec(html))) push(match[0].replace(/\\\//g, "/"));

  return Array.from(found);
}

async function resolvePinterestUrl(input: URL): Promise<string> {
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
    if (PINTEREST_PIN_RE.test(next.pathname)) return current;
    const host = next.hostname.toLowerCase();
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
    // Return the original string below.
  }
  return raw;
}

async function scrapePageForImages(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return [];
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("xml")) {
      await res.body?.cancel().catch(() => undefined);
      return [];
    }
    const html = await res.text();
    return extractImgUrls(html, res.url || pageUrl);
  } catch {
    return [];
  }
}

async function imageCandidates(rawUrl: string): Promise<string[]> {
  const parsed = new URL(rawUrl);
  const candidates = new Set<string>();
  const pageUrls = new Set<string>();

  if (isLikelyImage(rawUrl)) candidates.add(rawUrl);
  pageUrls.add(rawUrl);

  if (isPinterestUrl(parsed)) {
    const resolved = normalisePinterestPinUrl(await resolvePinterestUrl(parsed));
    pageUrls.add(resolved);
    const pinUrl = new URL(resolved);
    const oembed = new URL("https://www.pinterest.com/oembed.json");
    oembed.searchParams.set("url", pinUrl.toString());
    const embedRes = await fetch(oembed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
        Accept: "application/json",
      },
    }).catch(() => null);
    if (embedRes?.ok) {
      const payload = await embedRes.json().catch(() => null) as { thumbnail_url?: string; url?: string; html?: string } | null;
      if (payload?.thumbnail_url) candidates.add(payload.thumbnail_url);
      if (payload?.url && isLikelyImage(payload.url)) candidates.add(payload.url);
      if (payload?.html) for (const img of extractImgUrls(payload.html, pinUrl.toString())) candidates.add(img);
    }
  }

  // Fall back to scraping the page for og:image / <img> tags so pasted page
  // links (Pinterest, Google, blogs) resolve to a real image server-side.
  for (const page of pageUrls) {
    const found = await scrapePageForImages(page);
    for (const img of found) candidates.add(img);
    if (candidates.size > 0 && !isPinterestUrl(parsed)) break;
  }

  if (candidates.size === 0) candidates.add(rawUrl);
  return Array.from(candidates);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({})) as {
      board_id?: string;
      image_urls?: string[];
      caption?: string;
    };
    const { board_id, image_urls, caption } = body;
    if (!board_id || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(JSON.stringify({ error: "Missing board_id or image_urls" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (image_urls.length > 30) {
      return new Response(JSON.stringify({ error: "Too many images (max 30)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify board ownership + is_favourites flag
    const { data: board, error: boardErr } = await admin
      .from("moodboards")
      .select("id, user_id, is_favourites")
      .eq("id", board_id)
      .maybeSingle();
    if (boardErr || !board || board.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Board not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { url: string; ok: boolean; error?: string }[] = [];
    for (const rawUrl of image_urls) {
      try {
        let u: URL;
        try {
          u = new URL(rawUrl);
        } catch {
          results.push({ url: rawUrl, ok: false, error: "Invalid URL" });
          continue;
        }
        if (!/^https?:$/.test(u.protocol)) {
          results.push({ url: rawUrl, ok: false, error: "Not http(s)" });
          continue;
        }

        const candidates = await imageCandidates(u.toString());
        const queue = [...candidates];
        const seen = new Set(queue);
        let imgRes: Response | null = null;
        let fetchedUrl = u.toString();
        let lastError = "Could not fetch image";
        for (let i = 0; i < queue.length && i < 80; i += 1) {
          const candidate = queue[i];
          const res = await fetch(candidate, {
          headers: {
            // Some CDNs (Google, Pinterest) block empty UAs.
            "User-Agent":
              "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
            Accept: "image/*,*/*;q=0.8",
            Referer: isPinterestUrl(u) ? "https://www.pinterest.com/" : "https://mystrand.co.uk/",
          },
          redirect: "follow",
          }).catch((e) => {
            lastError = e instanceof Error ? e.message : String(e);
            return null;
          });
          if (!res) continue;
          if (!res.ok) {
            lastError = `HTTP ${res.status}`;
            await res.body?.cancel().catch(() => undefined);
            continue;
          }
          const candidateType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
          if (candidateType.includes("text/html") || candidateType.includes("xml")) {
            const html = await res.text().catch(() => "");
            const pageImages = html ? extractImgUrls(html, res.url || candidate) : [];
            for (const image of pageImages) {
              if (!seen.has(image)) {
                seen.add(image);
                queue.push(image);
              }
            }
            lastError = pageImages.length ? "Resolved page to image candidates" : `Unsupported type (${candidateType || "unknown"})`;
            continue;
          }
          if (!ALLOWED.includes(candidateType)) {
            lastError = `Unsupported type (${candidateType || "unknown"})`;
            await res.body?.cancel().catch(() => undefined);
            continue;
          }
          imgRes = res;
          fetchedUrl = candidate;
          break;
        }
        if (!imgRes) {
          results.push({ url: rawUrl, ok: false, error: lastError });
          continue;
        }

        const contentType = (imgRes.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED.includes(contentType)) {
          results.push({ url: rawUrl, ok: false, error: `Unsupported type (${contentType || "unknown"})` });
          continue;
        }
        const buf = new Uint8Array(await imgRes.arrayBuffer());
        if (buf.byteLength === 0) {
          results.push({ url: rawUrl, ok: false, error: "Empty file" });
          continue;
        }
        if (buf.byteLength > MAX_BYTES) {
          results.push({ url: rawUrl, ok: false, error: "File too large" });
          continue;
        }

        const ext = extForType(contentType);
        const id = crypto.randomUUID();
        const path = `${userId}/${board_id}/${id}.${ext}`;

        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, buf, { contentType, upsert: false });
        if (upErr) {
          results.push({ url: rawUrl, ok: false, error: upErr.message });
          continue;
        }

        const { error: insErr } = await admin.from("moodboard_images").insert({
          user_id: userId,
          board_id,
          storage_path: path,
          caption: caption ?? null,
          is_favourite: !!board.is_favourites,
        });
        if (insErr) {
          await admin.storage.from(BUCKET).remove([path]);
          results.push({ url: rawUrl, ok: false, error: insErr.message });
          continue;
        }
        results.push({ url: rawUrl, ok: true });
        if (fetchedUrl !== rawUrl) console.log("Imported moodboard cover via resolved image", { source: rawUrl, fetchedUrl });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ url: rawUrl, ok: false, error: msg });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ imported: okCount, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("moodboard-import-image error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
