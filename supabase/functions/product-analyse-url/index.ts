// Analyses a product URL for THIS user and returns the standard
// ProductAnalysisPayload. Phase 2 Step 4a: dual-path — Lovable+Gemini
// (legacy, Firecrawl-scraped) and Claude Sonnet 4.6 (new, native
// web_fetch + web_search), gated by STRAND_AI_PROVIDER_PRODUCT_URL.
//
// Architecture (audit PHASE_2_AUDIT.md §5 Step 4a, 2026-05-01):
//   - Schema `return_product_analysis` lives in _shared/schemas.ts and is
//     SHARED with product-analyse (Step 3) so the React renderer
//     (IngredientDetail.tsx, useProductUrlScan.ts) sees identical
//     payloads for both flows.
//   - Forced KB topics: porosity, scalp-conditions, diagnosed-conditions,
//     hard-water. selectTopicsForContext layers in extras up to a cap of 4.
//   - No RAG (web is the per-product fact channel; the manuscript RAG
//     channel remains book-only).
//   - Anthropic native web_fetch tool retrieves the page; web_search
//     fallback when the page is JS-rendered or gated. Combined max_uses
//     across both tools is bounded — tight upper bound on cost.
//   - Cache by `ai_summaries.kind = "product_analyse:<productKey>"`. URL
//     flow always has a productKey because the URL itself is a stable
//     identifier — when the caller doesn't supply one, hash the URL.
//   - Provenance stamped on every payload: _model_version,
//     _generated_at, _provider, _used_web_search, _web_search_count, _used_web_fetch.
//   - Logging: usage tokens + tool counts + sanitised search/fetch URLs
//     only. Never the analysis body.
//
// Provider flag — STRAND_AI_PROVIDER_PRODUCT_URL:
//   default "lovable" (legacy Firecrawl + Gemini path, unchanged).
//   "claude"        (new Sonnet 4.6 + web_fetch path).
//   Independent of STRAND_AI_PROVIDER_PRODUCT_PHOTO so URL and photo
//   paths can be toggled separately. Read at call time so a flag flip
//   in Lovable Cloud Secrets takes effect on the next invocation.
//
// CRITICAL: do NOT remove the Lovable+Gemini path. The flag defaults to
// "lovable"; Paige flips to "claude" only after manual verification.

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
  sanitiseChapterCitationsDeep,
} from "../_shared/book-chapters.ts";
import {
  callClaude,
  type ContentBlockInput,
  type ServerTool,
} from "../_shared/anthropic-client.ts";
import {
  RETURN_PRODUCT_ANALYSIS_SCHEMA,
  type ProductAnalysisPayload,
} from "../_shared/schemas.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { currentProfileHash } from "../_shared/profile-snapshot.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-sonnet-4-6@v1";

const INVALID_URL_MESSAGE =
  "STRAND needs a valid product page URL to analyse.";

interface RequestBody {
  url?: string;
  /** Optional product cache key. When omitted, the function hashes
   *  `url` so URL-flow calls are still cached deterministically. */
  productKey?: string;
  context?: Record<string, unknown> & {
    hairProfile?: Record<string, unknown>;
    healthProfile?: Record<string, unknown>;
    bloodResults?: unknown[];
    location?: { is_hard_water_area?: boolean | null };
    avoid_ingredients?: string[];
  };
  force?: boolean;
}

// ─── Selector context for KB topic matching ────────────────────────────
function buildSelectorContext(body: RequestBody): SelectorContext {
  const ctx = body.context ?? {};
  const hp = (ctx.hairProfile ?? {}) as Record<string, unknown>;
  const hl = (ctx.healthProfile ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
  return {
    hair: {
      porosity: arr(hp.porosity),
      density: arr(hp.density),
      scalp: arr(hp.scalp_condition),
      diagnosed: arr(hp.diagnosed_conditions),
    },
    health: {
      lifeStage: arr(hl.life_stage),
      contraception: arr(hl.contraception),
      conditions: arr(hl.medical_conditions),
    },
    bloodResults: Array.isArray(ctx.bloodResults) ? ctx.bloodResults : [],
    location: ctx.location ?? {},
  };
}

// ─── URL hashing for cache key (when caller didn't supply productKey) ─
async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Task instructions for Claude (URL flow) ───────────────────────────
function buildTaskInstructions(): string {
  return `You are receiving a product page URL. Use web_fetch to retrieve the page. Extract: product_name, brand, category, full INCI list (ingredients), usage instructions verbatim if present (usage_instructions). If the page is thin, gated, or in another language, use web_search to fill gaps from secondary sources. The output is identical in shape to the photo flow — return_product_analysis schema.

Voice for this task: every prose field follows the VOICE PRINCIPLES from the system block. Explain mechanism first, land verdict second; use connectives ("this means", "which is why", "so"); talk to "you" not "your hair"; translate any cosmetic-chemistry term on first use in a field; professional, direct, and never over-familiar.

Personalisation rules are identical to the photo flow (focus on hair type, hair goals, hair challenges directly affected by formulation; do NOT introduce tension/styling concerns, lab values, sleep, or dermatologist context unless the product mechanism directly addresses them; use 'consistently flagged ingredients' language never 'avoid list').

Tool budget: web_fetch and web_search share a combined cap of 4 invocations. Prefer ONE web_fetch on the supplied URL first. Only fall back to web_search if web_fetch returned a thin/empty body (page was JS-rendered, gated, or anti-bot-protected). Use web_search up to 3 times to find a cached version, the brand site direct, or a retailer mirror with the full INCI panel. Do NOT search if web_fetch already returned a clear brand + product name + full INCI.

Field rules — strict:
- product_name / brand: extracted from the page title, h1, or breadcrumbs. NEVER invent. If you can't determine confidently after fetch + search, return the closest readable text and start ai_summary with "Couldn't fully read the page —".
- category: pick the single best fit from the enum.
- ingredients: full INCI list, lowercase, in label order. Prefer the canonical web-resolved list when the fetched page's list is partial or hidden behind tabs; otherwise transcribe what's visible.
- key_ingredients: pick 4–6 of the most decision-relevant. flag = "avoid" only when the ingredient is one the user has consistently flagged in their history (appears in 3+ of their saved-and-favourited products) OR has a documented mechanism that conflicts with their measurable hair/health profile (e.g. drying alcohols on high porosity, sulphates with hard water + dry scalp). flag = "good" when it's in their favourite_ingredients, in their high_rated_products, or has a documented mechanism that benefits their measurable traits. flag = "warn" otherwise. Existence of a standard preservative / fragrance / colourant is NOT a reason to flag "avoid".
- match_score: 0–100, weighted down by red-flag ingredients, up by good flags. Consider category fit, current_hairstyle suitability, blood-marker deficiencies (only when relevant to the product), and goal alignment.
- ai_summary: 2–3 sentences MAXIMUM. Open by naming the SPECIFIC user signal that's driving the call (porosity, current_hairstyle, a goal, scalp condition, a flagged ingredient pattern) and what that means for THIS formula — then land the verdict (good fit / mixed fit / poor fit) in the next sentence, bridged with a connective ("which is why", "so", "this means"). Don't restate the same signal twice.
- usage_instructions: VERBATIM directions from the manufacturer if visible on the page. If no manufacturer directions are available, return "" — never invent or paraphrase.
- use_cases: MAXIMUM 2 items. Each item is ONE sentence (max two short sentences). Pick the 2 most actionable ways the user should use THIS product given their profile — not every possible use case. Each MUST tie back to one of: their hair profile, current_hairstyle, a goal, or a challenge they listed. Do NOT repeat manufacturer directions.
- tips: MAXIMUM 2 items. Each item is ONE sentence. Pick the 2 most relevant personal signals for THIS product. Not every signal in the user's profile is relevant to every product.

Citation rule: when guidance is rooted in the book, use the formal "Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]" line on its own line at the end of ai_summary. When facts come from the fetched page or web_search (e.g. "the brand's site states this is a low-pH cleanser"), reference them inline naturally in prose — do NOT put web-derived facts under the "Read more" line. Do NOT name any source manuscript, author, publisher, chapter, or page anywhere except the formal "Read more —" line.

MOISTURE — NON-NEGOTIABLE LANGUAGE RULE:
Moisture comes from water. Products do NOT add, restore, replace, infuse, replenish, deliver, hydrate-from-scratch, or otherwise create moisture. They seal it in, lock it in, help it stay, slow water loss, or improve absorption of the water already there. Use this phrasing only.

Hair-health guidance only — never medical advice. Recommend the user also seek GP/dermatologist support if a flag involves a diagnosed condition.

PRODUCT ANALYSIS SCOPE — HARD RULE:
When personalising a product analysis, focus ONLY on signals that intersect with what's INSIDE the product: ingredients, mechanism of action, formulation, application method.

Signals that ARE relevant for product analysis:
- Hair type (curl pattern, density, porosity, length, current style)
- Hair goals (length retention, definition, moisture retention, strength)
- Hair challenges directly affected by formulation (dryness, breakage, build-up, scalp condition, hard water, heat damage history)

Signals that are NOT relevant for product analysis (do NOT mention these in product output — not in ai_summary, key_ingredients[].reason, use_cases, or tips):
- Tension or styling-related concerns (traction alopecia, tight braids, weight of styles) — these are HANDLING concerns, not formulation concerns. A leave-in conditioner has no tension implications. Do NOT cite tension or traction alopecia in any product analysis unless the product is specifically a tension-related treatment.
- Lab values (ferritin, vitamin D, thyroid etc.) unless THIS specific product directly addresses them.
- Sleep, stress, cortisol — systemic concerns, not product-fit concerns.
- Dermatologist consultation context — only relevant if the product directly intersects with what the dermatologist is treating.

Rule of thumb: if you cannot draw a line from one of the product's INGREDIENTS to the user signal, DON'T cite that signal. The output should be SHORTER if the user profile has less to draw from, not padded with irrelevant context.

LANGUAGE RULE — NEVER use the phrase "avoid list", "avoid ingredients", "your avoids", "ingredients on your avoid list", "things to avoid", or imply the user has any list of ingredients they want to avoid. The only ingredient-history signal that exists in STRAND is "consistently flagged ingredients" — ingredients that appear in 3+ of the user's saved-and-favourited products that they're actively using. Use phrasing like "consistently flagged in your history", "ingredients you've flagged across your favourites", or "appears across 3+ products on your shelf and favourites". This applies to EVERY output field.

HARD-WATER GUIDANCE — HARD RULE:
NEVER recommend a chelating shampoo to the user, even when they're in a hard-water area. Chelating shampoos are too harsh for routine recommendation. If hard water is relevant to the verdict for THIS product, recommend instead — in this order: (1) a shower-head filter for hair-rinse water, (2) a gentle clarifying shampoo used sparingly (every 4–5 washes), (3) a deep conditioner immediately after any clarifying step, (4) a trichologist consult before considering anything stronger. Do NOT use the words "chelating shampoo" or "chelator" as a recommendation in ai_summary, use_cases, or tips. ("Chelator" can still appear as a neutral cosmetic-chemistry category label in key_ingredients when describing what an ingredient like EDTA is.)`;
}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
}): Promise<{
  payload: ProductAnalysisPayload;
  web_search_invocations: number;
  web_fetch_invocations: number;
}> {
  const userText = `Product page URL to analyse: ${args.url}

Use web_fetch on this URL first. If the fetched body is thin, gated, or missing the brand/INCI, fall back to web_search (combined cap of 4 across both tools). Return JSON only via the return_product_analysis tool.

User context (use to compute key_ingredients flags, match_score, ai_summary, use_cases, and tips):
${JSON.stringify(args.context ?? {}, null, 2)}`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const webFetchTool: ServerTool = {
    type: "web_fetch_20250910",
    name: "web_fetch",
    max_uses: 2,
  };
  const webSearchTool: ServerTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 2,
  };

  const req = await buildClaudeRequest({
    function_kind: "product-analyse-url",
    task_instructions: buildTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.context,
    selector_context: args.selectorContext,
    force_topic_ids: [
      "porosity",
      "scalp-conditions",
      "diagnosed-conditions",
      "hard-water",
    ],
    tool: {
      name: "return_product_analysis",
      description:
        "Return the structured product analysis. Always invoke this tool exactly once at the end with the final analysis.",
      input_schema: RETURN_PRODUCT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    },
    server_tools: [webFetchTool, webSearchTool],
    max_tokens: 4096,
  });

  const result = await callClaude<ProductAnalysisPayload>(req);

  const byName = result.server_tool_use_by_name ?? {};
  const web_search_invocations = byName["web_search"] ?? 0;
  const web_fetch_invocations = byName["web_fetch"] ?? 0;

  console.log(
    JSON.stringify({
      function: "product-analyse-url",
      provider: "claude",
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
      web_fetch_invocations,
      web_search_invocations,
      web_search_queries: result.server_tool_use_queries ?? [],
      url_host: (() => {
        try {
          return new URL(args.url).host;
        } catch {
          return "invalid";
        }
      })(),
    }),
  );

  if (!result.toolInput) {
    throw new Error("Claude returned no return_product_analysis tool_use block");
  }
  return {
    payload: result.toolInput,
    web_search_invocations,
    web_fetch_invocations,
  };
}

// ─── Provider: Lovable+Gemini (legacy, Firecrawl scrape) ───────────────
const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

const LOVABLE_SYSTEM = `${STRAND_PERSONA}

TASK
You are analysing a product page that the user has pasted as a URL, in Paige's voice.

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
   (porosity, texture, density, scalp), currentStyle (current_hairstyle,
   days_in_style, planned_next_style), goals (each with a "challenge" the user
   wrote and an optional "target_text"), location (hard water?), bloodResults,
   healthProfile (medications, conditions), history.avoid_ingredients,
   history.favourite_ingredients, history.low_rated_products and
   history.high_rated_products.
4. RED/GREEN FLAG LOGIC for key_ingredients[].flag:
   - "avoid" if in history.avoid_ingredients OR appears in any
     history.low_rated_products[].ingredients OR is contraindicated by their
     hair/health profile OR works against a stated goal/challenge.
   - "good" if in history.favourite_ingredients OR in
     history.high_rated_products[].ingredients OR well-matched to their
     porosity/texture/scalp OR directly supports a stated goal/challenge.
   - "warn" for neutral-but-noteworthy.
5. match_score (0–100): lower sharply for "avoid" flags; raise for "good";
   consider category fit, current hairstyle suitability, blood-result
   deficiencies, and goal alignment.
6. ai_summary: 2 short sentences MAX, second-person, in Paige's voice. The FIRST sentence cites
   a specific reason from THIS user's context — prefer their goal, challenge,
   or current_hairstyle when relevant. 7. usage_instructions: VERBATIM manufacturer directions. If the page contains
   a "Directions", "How to use", "Apply" or "Usage" block, transcribe it
   word-for-word into this field. If no manufacturer directions are visible
   on the page, set this to an empty string ("") — do NOT invent or
   paraphrase. This is the manufacturer's voice; keep it untouched.
8. use_cases: 2–4 concrete tips for how THIS user should use the product.
   Each tip MUST tie back to one of: their hair profile, current_hairstyle,
   a goal, or a challenge they listed (e.g. "Use weekly on wash day to
   support your length-retention goal", "Smooth onto edges between braid
   refreshes — your braids are 4 weeks in"). Do NOT repeat the manufacturer's
   directions verbatim here; build on them with personal reasoning.
9. Output STRICT JSON only. No prose, no code fences.

SCHEMA
{
  "product_name": string,
  "brand": string,
  "category": "shampoo"|"conditioner"|"treatment"|"styler"|"oil"|"mask"|"leave-in"|"other",
  "ingredients": string[],
  "key_ingredients": [{"name": string, "benefit": string, "flag": "good"|"warn"|"avoid", "reason": string}],
  "match_score": number,
  "ai_summary": string,
  "usage_instructions": string,
  "use_cases": string[],
  "tips": string[]
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
  imageUrl: string | null;
  source: "firecrawl" | "fetch";
}

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
        waitFor: 400,
      }),
      signal: AbortSignal.timeout(18_000),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("Firecrawl scrape failed", resp.status, errBody);
      return null;
    }
    const j = await resp.json();
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

function extractOgImageFromHtml(html: string): string | null {
  // Capture every og:image / og:image:secure_url / twitter:image meta tag,
  // handling BOTH attribute orders (property-then-content and
  // content-then-property). Then prefer secure_url > og:image > twitter:image
  // and prefer https over http when an equivalent pair exists.
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
      const kind = tag === "og:image:secure_url" ? "secure" : tag === "og:image" ? "og" : "twitter";
      found.push({ kind, url });
    }
  }
  // Prefer https; if only http available, rewrite to https. iOS Safari
  // blocks http images on https pages (mixed content) more aggressively
  // than desktop, so we enforce https before returning.
  const toHttps = (u: string | null | undefined): string | null => {
    if (!u) return null;
    return u.startsWith("http://") ? "https://" + u.slice("http://".length) : u;
  };
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

  const container = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  const scope = container ? container[1] : html;
  const img =
    scope.match(/<img[^>]+data-product-image[^>]*src=["']([^"']+)["']/i) ||
    scope.match(/<img[^>]+src=["']([^"']+)["']/i);
  return img ? toHttps(img[1]) : null;
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
      imageUrl: extractOgImageFromHtml(html),
      source: "fetch",
    };
  } catch (e) {
    console.error("plain fetch failed", e);
    return null;
  }
}

/** Lightweight og:image-only fetcher for the Claude path — Claude's native
 *  web_fetch returns text only. Runs in parallel with the model call. */
async function fetchOgImageOnly(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      console.log(JSON.stringify({ tag: "url-debug", phase: "og fetch non-ok", status: resp.status }));
      return null;
    }
    const extracted = extractOgImageFromHtml(await resp.text());
    console.log(JSON.stringify({ tag: "url-debug", phase: "image_url extracted", url: extracted }));
    return extracted;
  } catch (e) {
    console.error("[url-debug] og:image fetch failed", e);
    return null;
  }
}

async function runLovable(args: {
  url: string;
  context: Record<string, unknown>;
}): Promise<{ payload: ProductAnalysisPayload; image_url: string | null }> {
  const aiApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!aiApiKey) throw new Error("LOVABLE_API_KEY not configured");

  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  let scraped: ScrapeResult | null = null;
  if (firecrawlKey) {
    scraped = await scrapeWithFirecrawl(args.url, firecrawlKey);
  }
  if (!scraped) {
    scraped = await scrapeWithFetch(args.url);
  }
  if (!scraped) {
    const e: Error & { status?: number } = new Error(
      "Couldn't reach that page. The retailer may be blocking automated access — try a different link or upload a screenshot of the ingredients label instead.",
    );
    e.status = 502;
    throw e;
  }

  const TRIM = 9_000;
  const trimmed = scraped.text.length > TRIM ? scraped.text.slice(0, TRIM) : scraped.text;

  const userMsg = `Analyse this product page and return strict JSON matching the schema.

URL: ${args.url}
Page title: ${scraped.title}
Scrape source: ${scraped.source}

Page content (markdown / text, truncated):
"""
${trimmed}
"""

User context (use to compute flags, match_score, ai_summary, and use_cases):
${JSON.stringify(args.context ?? {}, null, 2)}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: LOVABLE_SYSTEM },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    console.error(`[product-analyse-url] lovable gateway ${status}: ${t.slice(0, 120)}`);
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const j = await aiResp.json();
  const txt: string = j.choices?.[0]?.message?.content ?? "{}";
  let out: ProductAnalysisPayload;
  try {
    out = JSON.parse(txt) as ProductAnalysisPayload;
  } catch {
    out = { raw: txt } as unknown as ProductAnalysisPayload;
  }
  return { payload: out, image_url: scraped.imageUrl };
}

// ─── Edge function entry ───────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const body = (await req.json()) as RequestBody;
    {
      const ac = (body.context ?? {}) as Record<string, unknown>;
      const goalsArr = Array.isArray(ac.goals) ? ac.goals as Array<Record<string, unknown>> : [];
      console.log("[ai-context-server] received", {
        currentStyle: ac.currentStyle ?? null,
        currentGoals: goalsArr.map((g) => g.title).filter(Boolean),
        currentChallenges: goalsArr.map((g) => g.challenge).filter(Boolean),
      });
    }

    // ── Input validation ────────────────────────────────────────────
    if (!body.url || typeof body.url !== "string") {
      return json(400, { error: INVALID_URL_MESSAGE });
    }
    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      return json(400, { error: INVALID_URL_MESSAGE });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return json(400, { error: INVALID_URL_MESSAGE });
    }
    const url = parsed.toString();

    const provider = readAiProvider("STRAND_AI_PROVIDER_PRODUCT_URL");

    // Cache key — URL is a stable identifier, so always cache. Use the
    // caller-supplied productKey when available; otherwise hash the URL.
    const productKey = body.productKey ?? (await sha256Hex(url));
    const cacheKind = `product_analyse:${productKey}`;

    // Compute profile hash up-front so we can use it for cache invalidation.
    const ctxEarly = body.context ?? {};
    const profileHashEarly = currentProfileHash(ctxEarly as Record<string, unknown>);

    // ── Cache check ────────────────────────────────────────────────
    if (!body.force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as ProductAnalysisPayload & { _profile_snapshot_hash?: string };
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION && cached._provider === "claude"
          : cached._provider !== "claude";
        const hashOk = cached._profile_snapshot_hash === profileHashEarly;
        if (versionOk && hashOk) {
          return json(200, sanitiseChapterCitationsDeep(cached));
        }
      }
    }

    const ctx = ctxEarly;
    const profileHash = profileHashEarly;
    let analysis: ProductAnalysisPayload;
    const t0 = Date.now();
    console.log(JSON.stringify({ tag: "url-debug", phase: "start", url, provider, profileHash }));

    if (provider === "claude") {
      // Run model call and og:image scrape in parallel — og fetch is ~1-3s,
      // Claude is ~20-40s. Parallelism keeps total time bounded by Claude.
      console.log(JSON.stringify({ tag: "url-debug", phase: "before model+og", ms: Date.now() - t0 }));
      const [claudeRes, ogImage] = await Promise.all([
        runClaude({ url, context: ctx, selectorContext: buildSelectorContext(body) }),
        fetchOgImageOnly(url),
      ]);
      const { payload, web_search_invocations, web_fetch_invocations } = claudeRes;
      console.log(JSON.stringify({
        tag: "url-debug", phase: "model+og done", ms: Date.now() - t0,
        used_web_fetch: web_fetch_invocations > 0, used_web_search: web_search_invocations > 0,
        og_image: ogImage ? "yes" : "no",
      }));
      analysis = {
        ...payload,
        _model_version: MODEL_VERSION,
        _generated_at: new Date().toISOString(),
        _provider: "claude",
        _used_web_search: web_search_invocations > 0,
        _web_search_count: web_search_invocations,
        _used_web_fetch: web_fetch_invocations > 0,
      };
      if (ogImage) {
        const safeImg = ogImage.startsWith("http://")
          ? "https://" + ogImage.slice("http://".length)
          : ogImage;
        (analysis as Record<string, unknown>)._source_image_url = safeImg;
        (analysis as Record<string, unknown>).image_url = safeImg;
      }
    } else {
      console.log(JSON.stringify({ tag: "url-debug", phase: "before lovable", ms: Date.now() - t0 }));
      const { payload, image_url } = await runLovable({ url, context: ctx });
      console.log(JSON.stringify({
        tag: "url-debug", phase: "lovable done", ms: Date.now() - t0,
        og_image: image_url ? "yes" : "no",
      }));
      analysis = {
        ...payload,
        _provider: "lovable",
        _generated_at: new Date().toISOString(),
      };
      if (image_url) {
        const safeImg = image_url.startsWith("http://")
          ? "https://" + image_url.slice("http://".length)
          : image_url;
        (analysis as Record<string, unknown>)._source_image_url = safeImg;
        if (!(analysis as Record<string, unknown>).image_url) {
          (analysis as Record<string, unknown>).image_url = safeImg;
        }
      }
    }
    (analysis as Record<string, unknown>)._profile_snapshot_hash = profileHash;
    console.log(JSON.stringify({ tag: "url-debug", phase: "all done", total_ms: Date.now() - t0 }));

    // ── Upsert cache ───────────────────────────────────────────────
    const { data: prior } = await supabase
      .from("ai_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", cacheKind)
      .maybeSingle();
    if (prior?.id) {
      await supabase.from("ai_summaries")
        .update({ payload: analysis as object, updated_at: new Date().toISOString() })
        .eq("id", prior.id);
    } else {
      await supabase.from("ai_summaries").insert({
        user_id: user.id,
        kind: cacheKind,
        payload: analysis as object,
      });
    }

    return new Response(
      JSON.stringify(sanitiseChapterCitationsDeep(analysis)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return aiErrorResponse(e, "product-analyse-url");
  }
});
