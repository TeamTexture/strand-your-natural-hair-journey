// Fetches a product page from a pasted URL using Firecrawl (handles JS-rendered
// pages and anti-bot protection that plain fetch() can't), then asks Gemini to
// return the same structured product analysis the product-analyse function
// returns from an image. Personalisation comes from the user-context payload,
// identical to product-analyse.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface Body {
  url?: string;
  context?: Record<string, unknown>;
}

const SYSTEM = `You are a haircare product ingredient expert analysing a product page that the user has pasted as a URL.

ABSOLUTE RULES
1. READ the product directly from the page text. The brand and product title
   are usually in the page <title>, h1, or breadcrumbs. NEVER invent a name —
   if you can't determine it confidently, set "ai_summary" to start with
   "Couldn't fully read the page —".
2. If the page lists ingredients (often labelled "Ingredients", "INCI", or
   "Full ingredients"), transcribe ALL of them into "ingredients" (lowercase,
   comma-separated source split into array). If only some are visible, return
   what you see — do not pad.
3. Personalise everything to the user's profile passed in context: hairProfile
   (porosity, texture, density, scalp), location (hard water?), bloodResults,
   healthProfile (medications, conditions), history.avoid_ingredients,
   history.favourite_ingredients, history.low_rated_products and
   history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" if in history.avoid_ingredients OR appears in any
     history.low_rated_products[].ingredients OR is contraindicated by their
     hair/health profile.
   - "good" if in history.favourite_ingredients OR in
     history.high_rated_products[].ingredients OR well-matched to their
     porosity/texture/scalp.
   - "warn" for neutral-but-noteworthy.
5. match_score (0–100): lower sharply for "avoid" flags; raise for "good";
   consider category fit and any blood-result deficiencies.
6. ai_summary: 2 short sentences MAX, second-person, citing ONE specific
   reason from THIS user's context.
7. use_cases: 2–4 concrete tips for how THIS user should use the product.
8. Output STRICT JSON only. No prose, no code fences.

SCHEMA
{
  "product_name": string,
  "brand": string,
  "category": "shampoo"|"conditioner"|"treatment"|"styler"|"oil"|"mask"|"leave-in"|"other",
  "ingredients": string[],
  "key_ingredients": [{"name": string, "benefit": string, "flag": "good"|"warn"|"avoid", "reason": string}],
  "match_score": number,
  "ai_summary": string,
  "use_cases": string[],
  "tips": string[]
}`;

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

/** Plain-text fallback used only if Firecrawl is unavailable. Many modern
 *  retailer sites are JS-rendered, so this fallback returns very little, but
 *  it keeps the function working for simple sites. */
function htmlToText(html: string): string {
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

interface ScrapeResult {
  title: string;
  text: string; // markdown preferred, falls back to plain text
  imageUrl: string | null;
  source: "firecrawl" | "fetch";
}

/** Pick the first http(s) image URL from markdown ![](...) syntax. */
function firstMarkdownImage(md: string): string | null {
  const m = md.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  return m ? m[1] : null;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<ScrapeResult | null> {
  try {
    const resp = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        // Wait a bit for client-rendered ingredient panels (Sephora, Boots, etc.)
        waitFor: 1500,
      }),
      // Firecrawl can take a while for JS-rendered pages.
      signal: AbortSignal.timeout(45_000),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("Firecrawl scrape failed", resp.status, errBody);
      return null;
    }
    const j = await resp.json();
    // v2 returns { success, data: { markdown, metadata } } per docs; some
    // gateway shapes flatten the payload, so try both.
    const data = (j?.data ?? j) as Record<string, unknown> | undefined;
    const markdown =
      (data?.markdown as string | undefined) ??
      ((data?.data as { markdown?: string } | undefined)?.markdown);
    const metadata =
      (data?.metadata as { title?: string; ogImage?: string; "og:image"?: string; image?: string } | undefined) ??
      ((data?.data as { metadata?: { title?: string; ogImage?: string; "og:image"?: string; image?: string } } | undefined)?.metadata);
    if (!markdown) {
      console.error("Firecrawl returned no markdown", JSON.stringify(j).slice(0, 500));
      return null;
    }
    // Prefer the OG image (set by retailers as the canonical product image),
    // fall back to the first inline image in the markdown.
    const imageUrl =
      metadata?.ogImage ??
      metadata?.["og:image"] ??
      metadata?.image ??
      firstMarkdownImage(markdown);
    return {
      title: metadata?.title ?? "",
      text: markdown,
      imageUrl: imageUrl ?? null,
      source: "firecrawl",
    };
  } catch (e) {
    console.error("Firecrawl error", e);
    return null;
  }
}

async function scrapeWithFetch(url: string): Promise<ScrapeResult | null> {
  try {
    const pageResp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!pageResp.ok) return null;
    const html = await pageResp.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    // Pull og:image / twitter:image / first product <img>.
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return {
      title: titleMatch ? titleMatch[1].trim() : "",
      text: htmlToText(html),
      imageUrl: ogMatch ? ogMatch[1] : null,
      source: "fetch",
    };
  } catch (e) {
    console.error("plain fetch failed", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { url, context } = (await req.json()) as Body;
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return new Response(JSON.stringify({ error: "That doesn't look like a valid web link." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return new Response(JSON.stringify({ error: "Only http(s) links are supported." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiApiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    // Prefer Firecrawl (handles JS-rendered pages and anti-bot blocks). Fall
    // back to plain fetch only if Firecrawl is unavailable or errors out.
    let scraped: ScrapeResult | null = null;
    if (firecrawlKey) {
      scraped = await scrapeWithFirecrawl(parsed.toString(), firecrawlKey);
    }
    if (!scraped) {
      scraped = await scrapeWithFetch(parsed.toString());
    }
    if (!scraped) {
      return new Response(
        JSON.stringify({
          error:
            "Couldn't reach that page. The retailer may be blocking automated access — try a different link or upload a screenshot of the ingredients label instead.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap the page text to keep token cost predictable. Firecrawl markdown is
    // already main-content only, so 18k chars is plenty for product pages.
    const TRIM = 18_000;
    const trimmed = scraped.text.length > TRIM ? scraped.text.slice(0, TRIM) : scraped.text;

    const userMsg = `Analyse this product page and return strict JSON matching the schema.

URL: ${parsed.toString()}
Page title: ${scraped.title}
Scrape source: ${scraped.source}

Page content (markdown / text, truncated):
"""
${trimmed}
"""

User context (use to compute flags, match_score, ai_summary, and use_cases):
${JSON.stringify(context ?? {}, null, 2)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await aiResp.json();
    const txt: string = j.choices?.[0]?.message?.content ?? "{}";
    let out: Record<string, unknown> = {};
    try { out = JSON.parse(txt); } catch { out = { raw: txt }; }

    // Attach the image URL pulled from the page so the client can save it
    // straight onto the product (no upload required for link-added items).
    if (scraped.imageUrl && !out.image_url) {
      out.image_url = scraped.imageUrl;
    }

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("product-analyse-url failed", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
