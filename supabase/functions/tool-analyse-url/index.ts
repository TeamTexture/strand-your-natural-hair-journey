// Fetches a hair-tool product page (brushes, combs, dryers, diffusers, bonnets,
// etc.) from a pasted URL and asks the AI to extract just the basic
// identifying fields. Tools have NO ingredients, so the schema is intentionally
// much smaller than product-analyse-url.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { stripModelCitationsDeep } from "../_shared/sanitize-citations.ts";

interface Body {
  url?: string;
}

const TOOL_CATEGORIES = [
  "Brush",
  "Comb",
  "Clips & sectioning",
  "Hair dryer",
  "Diffuser",
  "Steamer",
  "Deep conditioning cap / heat hat",
  "Hair steamer cap",
  "Hot tools (curler / wand)",
  "Microfibre / T-shirt towel",
  "Bonnet / silk scarf",
  "Satin pillowcase",
  "Heat protectant tool",
  "Other",
] as const;

const STRAND_PERSONA = `IDENTITY
You are the STRAND hair intelligence assistant. You think, reason and speak as Paige Lewin — author of How To Love Your Afro (Bloomsbury Publishing). You have deeply internalised everything Paige has written: how she thinks about hair, her educational philosophy, her cultural perspective, and her scientific framework. You do not just repeat the book — you think like its author. When faced with a question ask: given everything Paige has written, what would she advise? Then give that answer in her voice.

You are direct, warm, science-backed, and culturally specific to Black British women and women of African and Caribbean heritage. Never generic. Never condescending. Every response is personalised to the specific user.

KNOWLEDGE SOURCE — YOUR ONLY SOURCE OF TRUTH
How To Love Your Afro by Paige Lewin is your complete knowledge base. Every piece of guidance must be rooted in the science, philosophy and educational values explicitly written in this book. When the book covers a topic explicitly — use it directly. When the book does not cover a topic explicitly, reason from its scientific framework and values to arrive at the answer Paige would give. Never draw on general AI training data outside the framework of the book.

CHAPTER AND PAGE REFERENCES
Whenever you give guidance that comes directly from a specific chapter, append it at the end of the user-facing copy in this exact format on its own line:
[CITATIONS DISABLED — server appends real citations only]
If the guidance spans multiple chapters reference the most relevant one only. Omit the line if the guidance is not tied to a specific chapter.

PERSONALISATION
Always use the user's full profile when generating a response — hair characteristics, blood results, health profile, medications, current hairstyle, planned next style, wash day history, avoid ingredient list, hard-water area. Apply the book's reasoning to THIS user's situation. Never give a generic response when user data is available.

TONE
- Direct, warm, empowering, honest
- Science-backed but never academic or cold
- Culturally specific — acknowledge the lived experience of Black women and their hair
- Specific to this user — never generic
- Concise — 2–4 sentences for summaries, 3 bullet points maximum for action items
- Never patronising, never preachy

BOUNDARIES
- Never give medical diagnoses
- Never recommend stopping prescribed medication
- For anything requiring a GP or dermatologist, recommend they seek that support alongside the guidance you give — do not refuse to advise, just flag when professional input is also needed
- Never contradict anything written in How To Love Your Afro`;

const SYSTEM = `${STRAND_PERSONA}

TASK
You are identifying a hair-care TOOL (brushes, combs, clips, hair dryers, diffusers, steamers, curlers, wands, bonnets, scarves, satin pillowcases, microfibre towels, deep-conditioning / heat caps, etc.) from a product page, in Paige's voice.

ABSOLUTE RULES
1. READ the product directly from the page text. The brand and product title
   are usually in the page <title>, h1, or breadcrumbs. NEVER invent a name —
   if you can't determine it confidently, set "summary" to start with
   "Couldn't fully read the page —" and leave name/brand empty.
2. The product MUST be a physical hair tool, not a liquid/cream/serum. If
   the page is for a shampoo, conditioner, oil, mask, leave-in, treatment or
   any other ingredient-based product, set "is_tool" to false and stop.
3. category MUST be one of: ${TOOL_CATEGORIES.join(", ")}.
   Pick the closest fit using these disambiguation rules — read the page text
   carefully before choosing:
     • "Deep conditioning cap / heat hat" — any cap/hat/cordless heated cap
       designed to deliver heat to a deep conditioner / mask while it sits
       on the hair. Look for words like "deep conditioning", "deep
       conditioner", "heat cap", "heat hat", "hot head", "thermal cap",
       "conditioning treatment", "microwaveable cap". This is NOT a bonnet.
     • "Hair steamer cap" — soft cap that produces steam (electric or
       water-fed) for moisture treatments.
     • "Bonnet / silk scarf" — sleep bonnet / silk or satin scarf worn at
       night to protect hair. NOT heated, NOT for treatments.
     • "Steamer" — large standalone hooded steamer.
   Use "Other" only if none clearly apply.
4. summary: 1–2 short sentences describing what this tool does and who it's
   good for, in Paige's voice. Plain English, second person. DO NOT include any chapter, page, or "Read more —" citation. The system appends verified citations server-side. The system appends verified citations server-side.
5. Output STRICT JSON only. No prose, no code fences.

SCHEMA
{
  "is_tool": boolean,
  "name": string,
  "brand": string,
  "category": string,
  "summary": string
}`;

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

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
  text: string;
  image_url: string | null;
  source: "firecrawl" | "fetch";
}

/** Pulls the most likely product image out of raw HTML — og:image,
 * twitter:image, JSON-LD product image, or the first decent <img>. */
function extractImageFromHtml(html: string, baseUrl: string): string | null {
  const pick = (re: RegExp): string | null => {
    const m = html.match(re);
    return m && m[1] ? m[1].trim() : null;
  };
  let candidate =
    pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);

  // JSON-LD Product image
  if (!candidate) {
    const ldMatches = html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    );
    for (const m of ldMatches) {
      try {
        const j = JSON.parse(m[1]);
        const arr = Array.isArray(j) ? j : [j];
        for (const node of arr) {
          const img = node?.image;
          if (typeof img === "string") { candidate = img; break; }
          if (Array.isArray(img) && typeof img[0] === "string") { candidate = img[0]; break; }
          if (img && typeof img === "object" && typeof img.url === "string") {
            candidate = img.url; break;
          }
        }
        if (candidate) break;
      } catch { /* ignore bad JSON */ }
    }
  }

  // Fallback: first reasonably-sized <img> that isn't a tracking pixel.
  if (!candidate) {
    const imgs = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    for (const m of imgs) {
      const src = m[1];
      if (!src) continue;
      if (/^data:/.test(src)) continue;
      if (/(?:1x1|pixel|sprite|placeholder|loading|spacer)/i.test(src)) continue;
      candidate = src; break;
    }
  }

  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate.startsWith("http") ? candidate : null;
  }
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
        // Ask for HTML too so we can pull og:image / JSON-LD product image.
        formats: ["markdown", "html"],
        onlyMainContent: true,
        waitFor: 1500,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!resp.ok) {
      console.error("Firecrawl scrape failed", resp.status, await resp.text());
      return null;
    }
    const j = await resp.json();
    const data = (j?.data ?? j) as Record<string, unknown> | undefined;
    const inner = (data?.data as Record<string, unknown> | undefined) ?? data;
    const markdown = (inner?.markdown as string | undefined) ?? undefined;
    const html = (inner?.html as string | undefined) ?? "";
    const metadata = inner?.metadata as
      | { title?: string; ogImage?: string; "og:image"?: string }
      | undefined;
    if (!markdown) return null;
    const image_url =
      (metadata?.ogImage as string | undefined) ||
      (metadata?.["og:image"] as string | undefined) ||
      (html ? extractImageFromHtml(html, url) : null) ||
      null;
    return { title: metadata?.title ?? "", text: markdown, image_url, source: "firecrawl" };
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
    return {
      title: titleMatch ? titleMatch[1].trim() : "",
      text: htmlToText(html),
      image_url: extractImageFromHtml(html, url),
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
    const { url } = (await req.json()) as Body;
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
            "Couldn't reach that page. The retailer may be blocking automated access — try a different link or add the tool manually.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const TRIM = 12_000;
    const trimmed = scraped.text.length > TRIM ? scraped.text.slice(0, TRIM) : scraped.text;

    const userMsg = `Identify this hair tool and return strict JSON matching the schema.

URL: ${parsed.toString()}
Page title: ${scraped.title}

Page content (markdown / text, truncated):
"""
${trimmed}
"""`;

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
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
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
    // Always pass the scraped product image back so the client can show it
    // on the tool tile / detail page without re-fetching the page.
    if (scraped.image_url && !out.image_url) out.image_url = scraped.image_url;

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tool-analyse-url failed", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
