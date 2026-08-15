// Analyses a hair-tool URL for THIS user. Phase 2 Step 4b: dual-path —
// Lovable+Gemini (legacy, Firecrawl-scraped) and Claude (new, native
// web_fetch + web_search), gated by STRAND_AI_PROVIDER_TOOL_URL.
//
// Mirrors product-analyse-url architecture. Tools have NO ingredients, so
// the schema is smaller — see _shared/tool-schema.ts.

import { corsHeaders } from "../_shared/cors.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { readAiProvider } from "../_shared/flags.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import {
  CHAPTER_WHITELIST_PROMPT,
} from "../_shared/book-chapters.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import {
  callClaude,
  type ContentBlockInput,
  type ServerTool,
} from "../_shared/anthropic-client.ts";
import {
  RETURN_TOOL_ANALYSIS_SCHEMA,
  TOOL_KIND_ENUM,
  type ToolAnalysisPayload,
} from "../_shared/tool-schema.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { currentProfileHash } from "../_shared/profile-snapshot.ts";
import {
  TOOL_SCORE_REASONS_RULES,
  sanitiseScoreReasons,
  alignScoreWithReasons,
  firstSentence,
} from "../_shared/score-reasons.ts";
import { coerceTipsLevel, buildTipsLevelBlock, type TipsLevel } from "../_shared/tips-level.ts";

/** Level-aware depth cap — identical to the product analysis paths. */
function levelCap(level: TipsLevel): number {
  if (level >= 3) return 4;
  if (level === 2) return 3;
  return 1;
}

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-haiku-4-5@v5-verified-image-2026-08-09";
const LOVABLE_MODEL_VERSION = "lovable-firecrawl@v5-verified-image-2026-08-09";
const INVALID_URL_MESSAGE = "STRAND needs a valid product page URL to analyse.";

// Legacy categories the Lovable path returns (kept stable for back-compat with
// MyToolsSection.tsx which matches against TOOL_CATEGORIES on the client).
const LEGACY_TOOL_CATEGORIES = [
  "Brush",
  "Comb",
  "Clips & sectioning",
  "Hair dryer",
  "Diffuser",
  "TT Heat Hat",
  "Hot tools (curler / wand)",
  "Microfibre / T-shirt towel",
  "Bonnet / silk scarf",
  "Satin pillowcase",
  "Heat protectant tool",
  "Other",
] as const;

interface RequestBody {
  url?: string;
  toolKey?: string;
  context?: Record<string, unknown> & {
    hairProfile?: Record<string, unknown>;
    healthProfile?: Record<string, unknown>;
    bloodResults?: unknown[];
  };
  force?: boolean;
}

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
  };
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Claude task instructions ──────────────────────────────────────────
function buildTaskInstructions(tipsLevel: TipsLevel): string {
  const cap = levelCap(tipsLevel);
  return `You are receiving a hair-care TOOL product page URL (brushes, combs, hair dryers, diffusers, TT Heat Hats, bonnets, satin pillowcases, microfibre towels, curlers, wands, etc.). Use web_fetch to retrieve the page. Extract the basic identity (brand, tool name, classification) and produce a short personalised analysis for THIS user.

Voice for this task: every prose field follows the VOICE PRINCIPLES from the system block. Explain the tool's mechanism first ("a TT Heat Hat holds warmth around the conditioner, which means…"), then land the verdict; use connectives; talk to "you" not "your hair"; translate any specialist term on first use in a field; professional, direct, and never over-familiar.

Tool budget: web_fetch and web_search share a combined cap of 4 invocations. Prefer ONE web_fetch on the supplied URL first. Only fall back to web_search (max 2) if web_fetch returned a thin/empty body. Do NOT search if web_fetch returned a clear brand + product name + tool kind.

Field rules — strict:
- tool_name / brand: extracted from the page title, h1, or breadcrumbs. NEVER invent. If unable to determine confidently after fetch + search, return the closest readable text and start ai_summary with "Couldn't fully read the page —".
- tool_kind: pick the single best match from the enum. Use these disambiguation rules:
   * "deep_conditioning_cap" — products that are specifically the TT Heat Hat or a Team Texture product page for it. NOT a bonnet.
   * "heat_cap" — only use for TT Heat Hat pages; do not recommend generic heat caps in prose.
   * "satin_bonnet" — sleep bonnet / silk or satin scarf. NOT heated.
   * "hooded_dryer" — large standalone hooded dryer.
   * "diffuser" — attachment for a hand-held dryer (NOT the dryer itself).
   * "blow_dryer" / "hair_dryer" — hand-held dryer.
   * Use "other" only if none clearly apply.
- ai_summary: 2–3 sentences MAX. Open by naming the user signal that's driving the call (a goal, a challenge, a hair-type trait the tool's mechanism touches — never the style they're in) and what the tool's mechanism means for it — then land the verdict (good fit / mixed fit / poor fit) in the next sentence, bridged with a connective. Paige's voice, second person.
- key_features: MAX 4. Each item is { name, relevance } — only include features whose relevance ties back to the user's hair type, hair characteristics, goal, or a challenge directly addressed by the tool's mechanism.
- use_cases: MAX ${cap} items, each ≤ 1 short sentence. Pick the 2 most actionable ways THIS user should use the tool given their profile.
- tips: MAX ${cap} items, each ≤ 1 short sentence. The 2 most relevant personal signals for THIS tool.
- warnings: optional, MAX 2. Only include if the tool has a contraindication for THIS user (e.g. high heat tool when user has a heat-damage challenge, dry/porous strands, chemical processing, or a length/retention goal).
- personalisation_rationale: 2–3 sentences. MUST follow the pattern: "Because your hair is [specific trait — porosity/density/scalp/state from the profile] and you want [specific goal from the user's goals], this tool [names the specific risk from its mechanism]. If you use it, [concrete precaution]." Never generic. If a goal or trait is missing from the profile, drop that clause — do NOT invent one.
- match_score: integer 0–100 for how well this tool fits THIS user (hair type, hair characteristics, goals, challenges). The style they're in right now, and how long they've been in it, must never move the score. Be honest — poor fits should score 20–40, mixed 40–65, strong fits 70–90. Reserve 90+ for near-ideal matches.
- how_to_use: 2–4 short sentences, second person, on how THIS user specifically should use it (heat setting tied to their porosity, section size tied to their density, the signals that tell them it is suiting their hair, thermal-protection product step, cool-down / low-manipulation follow-up). Anchor at least one instruction to a value from the user's profile.
- pair_with: up to 4 pairings supporting THIS tool. Sources, in priority order:
   1. source='shelf' — real items from context.shelf / high_rated_products / user's tools. Use their real name + brand.
   2. source='wishlist' — real items from context.wishlist. Use their real name + brand. Flag these so the UI can offer a buy link.
   3. source='suggested' — ONLY when nothing on shelf/wishlist fits. Describe a generic product type the user should look for (e.g. "a water-based leave-in with silk amino acids and glycerin", "a ceramic-plate heat protectant spray rated to 230°C"). Never invent a brand.
   Every entry needs a personalised 'why' tying the pairing to the user's hair goal, challenge, hair characteristic, or the specific risk of using this tool.
- routine_suggestion: 1–2 sentences slotting the tool into this user's routine — reference their last wash-day steps, cadence, or how long the hair has been worn up (a duration, never a style name) when relevant. Empty string if nothing meaningful.

Wash-day baseline: if this tool affects wash day, detangling, conditioning, drying or styling after washing, keep the routine logic aligned to the manuscript baseline — proper shampoo cleansing of scalp and hair happens before conditioning. Never imply a tool replaces cleansing. For heat during conditioning, the only allowed heat tool is [TT Heat Hat](https://www.teamtexture.co.uk).

Grounding rule: when guidance is rooted in the manuscript, reason from the underlying teaching and blend it into STRAND's voice. Do NOT name the book, author, chapters or pages, and do NOT emit any "Read more —" line. Web-derived facts go inline naturally.

PRODUCT/TOOL ANALYSIS SCOPE — HARD RULE:
Focus ONLY on signals that intersect with what the tool DOES (mechanism, heat, tension, surface contact, materials). Do NOT cite:
- Tension/styling concerns unless the tool's mechanism is tension-related (e.g. don't cite tight braids when discussing a satin pillowcase).
- Lab values, sleep, cortisol, dermatologist context unless the tool's mechanism directly addresses them.

Hair-health guidance only — never medical advice.

${TOOL_SCORE_REASONS_RULES}

${NON_PRESCRIPTIVE_RULES}

${STYLE_WEIGHTING_RULES}`;
}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
  pageTitle?: string;
  pageText?: string;
}): Promise<{
  payload: ToolAnalysisPayload;
  web_search_invocations: number;
  web_fetch_invocations: number;
}> {
  const pageBlock = args.pageText && args.pageText.length > 300
    ? `Page content already retrieved for you (title: ${args.pageTitle || "unknown"}). Use THIS as your primary source — do NOT call web_fetch unless the brand or tool name is genuinely missing below:

<page_content>
${args.pageText.slice(0, 12_000)}
</page_content>`
    : `Use web_fetch on this URL first. If thin/gated, fall back to web_search (combined cap of 4).`;

  const userText = `Hair-tool product page URL to analyse: ${args.url}

${pageBlock}

Return JSON only via the return_tool_analysis tool.

User context (use to compute personalisation, ai_summary, use_cases, tips):
${JSON.stringify(args.context ?? {}, null, 2)}`;


  const tipsLevel = coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel);
  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const webFetchTool: ServerTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2 };
  const webSearchTool: ServerTool = { type: "web_search_20250305", name: "web_search", max_uses: 2 };

  const req = await buildClaudeRequest({
    function_kind: "tool-analyse-url",
    task_instructions: buildTaskInstructions(tipsLevel),
    user_payload: {},
    user_content: userContent,
    user_context: args.context,
    selector_context: args.selectorContext,
    force_topic_ids: ["wash-day-mechanics", "porosity", "scalp-conditions", "heat-and-moisture", "protective-styling"],
    rag_query: `hair tool ${args.url} heat detangle scalp damage Afro texture porosity`,
    rag_k: 4,
    tool: {
      name: "return_tool_analysis",
      description:
        "Return the structured tool analysis. Always invoke this tool exactly once at the end with the final analysis.",
      input_schema: RETURN_TOOL_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    },
    server_tools: [webFetchTool, webSearchTool],
    max_tokens: 3000,
  });

  const result = await callClaude<ToolAnalysisPayload>(req);
  const byName = result.server_tool_use_by_name ?? {};
  const web_search_invocations = byName["web_search"] ?? 0;
  const web_fetch_invocations = byName["web_fetch"] ?? 0;

  console.log(
    JSON.stringify({
      function: "tool-analyse-url",
      provider: "claude",
      input_tokens: result.usage.input_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
      web_fetch_invocations,
      web_search_invocations,
      web_search_queries: result.server_tool_use_queries ?? [],
      url_host: (() => { try { return new URL(args.url).host; } catch { return "invalid"; } })(),
    }),
  );

  if (!result.toolInput) {
    throw new Error("Claude returned no return_tool_analysis tool_use block");
  }
  return {
    payload: result.toolInput,
    web_search_invocations,
    web_fetch_invocations,
  };
}

// ─── Lovable path (legacy, Firecrawl + Gemini) ─────────────────────────
const STRAND_PERSONA = STRAND_PERSONA_WITH_RULES;

import {
  buildGroundingBlock,
  ragQueryFromAiContext,
  selectorFromAiContext,
} from "../_shared/grounding.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
import { STYLE_WEIGHTING_RULES } from "../_shared/style-weighting.ts";
import { allChallenges, challengeText, challengesOf } from "../_shared/challenges.ts";

const LOVABLE_SYSTEM = `${STRAND_PERSONA}

TASK
You are identifying a hair-care TOOL (brushes, combs, clips, hair dryers, diffusers, curlers, wands, bonnets, scarves, satin pillowcases, microfibre towels, TT Heat Hat pages, etc.) from a product page, in Paige's voice.

ABSOLUTE RULES
1. READ the product directly from the page text. The brand and product title
   are usually in the page <title>, h1, or breadcrumbs. NEVER invent a name —
   if you can't determine it confidently, set "summary" to start with
   "Couldn't fully read the page —" and leave name/brand empty.
2. The product MUST be a physical hair tool, not a liquid/cream/serum. If
   the page is for a shampoo, conditioner, oil, mask, leave-in, treatment or
   any other ingredient-based product, set "is_tool" to false and stop.
3. category MUST be one of: ${LEGACY_TOOL_CATEGORIES.join(", ")}.
4. summary: 1–2 short sentences describing what this tool does and who it's
   good for, in Paige's voice. Plain English, second person.
5. Output STRICT JSON only. No prose, no code fences.
6. match_score is an integer 0-100 for how well this tool fits THIS user's hair
   characteristics, current/planned style, goals and any flagged markers the
   tool's mechanism actually touches. Poor fits 20-40, mixed 40-65, strong
   70-90. Reserve 90+ for near-ideal.
7. how_to_use: 1-3 short sentences on how THIS user should use it, anchored to
   at least one value from their profile.

SCHEMA
{
  "is_tool": boolean,
  "name": string,
  "brand": string,
  "category": string,
  "summary": string,
  "match_score": number,
  "score_reasons": [{"direction": "plus"|"minus", "factor": string, "reason": string}],
  "how_to_use": string
}

${TOOL_SCORE_REASONS_RULES}

${NON_PRESCRIPTIVE_RULES}

${STYLE_WEIGHTING_RULES}`;

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ").trim();
}

interface ScrapeResult {
  title: string;
  text: string;
  image_url: string | null;
  source: "firecrawl" | "fetch";
}

/** Page chrome — flags, payment badges, logos, social icons, support widgets —
 * is never the hero product shot. Mirrors product-analyse-url so tools get the
 * same quality of image extraction as hair care products.
 *
 * Tested against the FILENAME only: retailer CDN directory names routinely
 * contain words like logo, icon, badge, secure, search, menu, cart, support
 * and help, and matching the whole URL discarded real product shots. */
const CHROME_RE =
  /(union[-_]?jack|\bicon\b|^icons?[-_.]|[-_]icon[-_.]|logo|sprite|payment|visa|mastercard|amex|paypal|klarna|applepay|gpay|trustpilot|placeholder|spinner|loader|1x1|blank|transparent|burger|chevron)/i;

function imageFilename(u: string): string {
  const withoutQuery = u.split("?")[0].split("#")[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function isLikelyProductImage(u: string | null | undefined): boolean {
  if (!u) return false;
  if (/^data:/i.test(u)) return false;
  const file = imageFilename(u);
  if (/\.(svg|gif)$/i.test(file)) return false;
  if (CHROME_RE.test(file)) return false;
  // A small declared size means a list-size variant, not junk — the client
  // requests a larger variant, so keep it.
  return true;
}

function firstMarkdownImage(md: string): string | null {
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (isLikelyProductImage(m[1])) return m[1];
  }
  return null;
}

function firstUsableImage(...candidates: Array<string | null | undefined>): string | null {
  return candidates.find((c) => isLikelyProductImage(c)) ?? null;
}

/** Retailers often expose a technically valid og:image that is actually a tiny
 * ticket, badge or tracking tile. Reject very small payloads before saving it. */
async function isSubstantialRemoteImage(url: string | null): Promise<boolean> {
  if (!url || !isLikelyProductImage(url)) return false;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/avif,image/webp,image/*" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok || !/^image\//i.test(resp.headers.get("content-type") ?? "")) return false;
    const declared = Number(resp.headers.get("content-length") ?? 0);
    if (declared > 0) {
      try { await resp.body?.cancel(); } catch { /* ignore */ }
      return declared >= 4_000;
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return bytes.byteLength >= 4_000;
  } catch {
    return false;
  }
}

/** If the supplied retailer hides its real gallery behind JavaScript, search
 * for the exact identified tool and inspect those product pages for a usable
 * hero image. This runs only when the original image failed validation. */
async function findExactProductImage(
  brand: unknown,
  name: unknown,
  firecrawlKey: string | undefined,
): Promise<string | null> {
  const terms = [brand, name].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!firecrawlKey || terms.length === 0) return null;
  try {
    const resp = await fetch(`${FIRECRAWL_V2}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `\"${terms.join(" ")}\" product`,
        limit: 5,
        scrapeOptions: { formats: ["markdown", "html"], onlyMainContent: true },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const results = (Array.isArray(json?.data) ? json.data : json?.data?.data) as Array<Record<string, unknown>> | undefined;
    for (const result of results ?? []) {
      const metadata = result.metadata as Record<string, unknown> | undefined;
      const pageUrl = typeof result.url === "string"
        ? result.url
        : typeof metadata?.sourceURL === "string" ? metadata.sourceURL : "";
      const html = typeof result.html === "string" ? result.html : "";
      const markdown = typeof result.markdown === "string" ? result.markdown : "";
      const candidate = firstUsableImage(
        typeof metadata?.ogImage === "string" ? metadata.ogImage : null,
        typeof metadata?.["og:image"] === "string" ? metadata["og:image"] : null,
        html && pageUrl ? extractImageFromHtml(html, pageUrl) : null,
        firstMarkdownImage(markdown),
      );
      if (await isSubstantialRemoteImage(candidate)) return candidate;
    }
  } catch (error) {
    console.error("Exact product image search failed", error);
  }
  return null;
}

function extractImageFromHtml(html: string, baseUrl: string): string | null {
  const abs = (candidate: string | null | undefined): string | null => {
    if (!candidate) return null;
    try {
      const u = new URL(candidate.trim(), baseUrl).toString();
      return u.startsWith("http://") ? "https://" + u.slice(7) : u;
    } catch {
      return null;
    }
  };
  const pick = (re: RegExp): string | null => {
    const m = html.match(re);
    return m && m[1] ? m[1].trim() : null;
  };

  // Structured product data outranks social metadata.
  const catalogImage = pick(/["']productImageURL["']\s*:\s*["']([^"']+)["']/i);
  if (isLikelyProductImage(catalogImage)) return abs(catalogImage);

  const productContainer = pick(
    /<div[^>]+class=["'][^"']*\bproduct-image\b[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
  );
  if (isLikelyProductImage(productContainer)) return abs(productContainer);

  const meta = firstUsableImage(
    pick(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i),
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i),
    pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i),
    pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i),
  );
  if (meta) return abs(meta);

  const container = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  const scope = container ? container[1] : html;
  const marked = scope.match(
    /<img[^>]+(?:data-product-image|itemprop=["']image["'])[^>]*src=["']([^"']+)["']/i,
  );
  if (marked && isLikelyProductImage(marked[1])) return abs(marked[1]);

  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(scope)) !== null) {
    if (isLikelyProductImage(m[1])) return abs(m[1]);
  }
  return null;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<ScrapeResult | null> {
  try {
    const resp = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: true, waitFor: 1500 }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const data = (j?.data ?? j) as Record<string, unknown> | undefined;
    const inner = (data?.data as Record<string, unknown> | undefined) ?? data;
    const markdown = (inner?.markdown as string | undefined) ?? undefined;
    const html = (inner?.html as string | undefined) ?? "";
    const metadata = inner?.metadata as
      | { title?: string; ogImage?: string; "og:image"?: string; image?: string }
      | undefined;
    if (!markdown) return null;
    // Filter metadata through the same chrome test, then fall back to the
    // page HTML and finally the first usable image in the main content.
    const image_url =
      firstUsableImage(metadata?.ogImage, metadata?.["og:image"], metadata?.image) ||
      (html ? extractImageFromHtml(html, url) : null) ||
      firstMarkdownImage(markdown) ||
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
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
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

async function fetchOgImageOnly(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    return extractImageFromHtml(await resp.text(), url);
  } catch {
    return null;
  }
}

/** Follow retailer short links (amzn.eu/d/..., amzn.to, bit.ly, a.co) to the
 *  canonical product URL so scrapers and the model see a real product page. */
async function resolveShortLink(url: string): Promise<string> {
  let host = "";
  try { host = new URL(url).host.toLowerCase(); } catch { return url; }
  const isShort = /^(amzn\.(eu|to|asia|com))$|^a\.co$|^bit\.ly$|^t\.co$|^tinyurl\.com$|^s\.click\.aliexpress\.com$/.test(host);
  if (!isShort) return url;
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8_000),
    });
    const finalUrl = resp.url && resp.url !== url ? resp.url : url;
    try { await resp.body?.cancel(); } catch { /* ignore */ }
    console.log(JSON.stringify({ tag: "tool-debug", phase: "shortlink resolved", from: url, to: finalUrl }));
    return finalUrl;
  } catch {
    return url;
  }
}

/** Retrieve the page for the Claude path. Firecrawl first (renders JS and gets
 *  past retailer anti-bot walls such as Amazon's), plain fetch as a fallback. */
async function prefetchPage(
  url: string,
): Promise<{ imageUrl: string | null; title: string; text: string }> {
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  let scraped: ScrapeResult | null = null;
  if (firecrawlKey) scraped = await scrapeWithFirecrawl(url, firecrawlKey);
  if (!scraped || (scraped.text ?? "").length < 300) {
    const plain = await scrapeWithFetch(url);
    if (plain && (plain.text ?? "").length > (scraped?.text?.length ?? 0)) scraped = plain;
  }
  console.log(JSON.stringify({
    tag: "tool-debug", phase: "prefetch done",
    source: scraped?.source ?? "none",
    text_len: scraped?.text?.length ?? 0,
    has_image: scraped?.image_url ? "yes" : "no",
  }));
  if (!scraped) return { imageUrl: null, title: "", text: "" };
  return { imageUrl: scraped.image_url, title: scraped.title, text: scraped.text };
}



async function runLovable(args: {
  url: string;
  context: Record<string, unknown>;
}): Promise<{ payload: Record<string, unknown>; image_url: string | null }> {
  const aiApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!aiApiKey) throw new Error("LOVABLE_API_KEY not configured");
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  const lovableUrl = await resolveShortLink(args.url);
  let scraped: ScrapeResult | null = null;
  if (firecrawlKey) scraped = await scrapeWithFirecrawl(lovableUrl, firecrawlKey);
  if (!scraped) scraped = await scrapeWithFetch(lovableUrl);
  if (!scraped) {
    const e: Error & { status?: number } = new Error(
      "Couldn't reach that page. The retailer may be blocking automated access — try a different link or add the tool manually.",
    );
    e.status = 502;
    throw e;
  }

  const TRIM = 12_000;
  const trimmed = scraped.text.length > TRIM ? scraped.text.slice(0, TRIM) : scraped.text;
  const userMsg = `Identify this hair tool and return strict JSON matching the schema.

URL: ${args.url}
Page title: ${scraped.title}

Page content (markdown / text, truncated):
"""
${trimmed}
"""

User context (for personalisation hints):
${JSON.stringify(args.context ?? {}, null, 2)}`;

  const groundingCtx = (args.context ?? null) as Record<string, unknown> | null;
  const grounding = await buildGroundingBlock({
    surface: "tool-analyse-url",
    fn: "tool-analyse-url",
    functionKind: "tool-analyse-url",
    selectorContext: selectorFromAiContext(groundingCtx),
    forceTopics: ["wash-day-mechanics","porosity","scalp-conditions","heat-and-moisture","protective-styling"],
    ragQuery: ragQueryFromAiContext(groundingCtx, "hair tool heat detangling scalp damage Afro texture porosity"),
    ragK: 4,
  });

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        {
          role: "system",
          content: `${LOVABLE_SYSTEM}\n\n${buildTipsLevelBlock(
            coerceTipsLevel((args.context as Record<string, unknown> | undefined)?.tipsLevel),
          )}${grounding.block}`,
        },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    const t = await aiResp.text();
    const err: Error & { status?: number } = new Error(t.slice(0, 200));
    err.status = status;
    throw err;
  }

  const j = await aiResp.json();
  const txt: string = j.choices?.[0]?.message?.content ?? "{}";
  let out: Record<string, unknown> = {};
  try { out = JSON.parse(txt); } catch { out = { raw: txt }; }
  return { payload: out, image_url: scraped.image_url };
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const body = (await req.json()) as RequestBody;
    {
      const ac = (body.context ?? {}) as Record<string, unknown>;
      const goalsArr = Array.isArray(ac.goals) ? ac.goals as Array<Record<string, unknown>> : [];
      console.log("[ai-context-server] received", {
        fn: "tool-analyse-url",
        currentStyle: ac.currentStyle ?? null,
        currentGoals: goalsArr.map((g) => g.title).filter(Boolean),
        currentChallenges: allChallenges(goalsArr),
      });
    }

    if (!body.url || typeof body.url !== "string") return jsonResp(400, { error: INVALID_URL_MESSAGE });
    let parsed: URL;
    try { parsed = new URL(body.url); } catch { return jsonResp(400, { error: INVALID_URL_MESSAGE }); }
    if (!/^https?:$/.test(parsed.protocol)) return jsonResp(400, { error: INVALID_URL_MESSAGE });
    const url = parsed.toString();

    const provider = readAiProvider("STRAND_AI_PROVIDER_TOOL_URL");
    const toolKey = body.toolKey ?? (await sha256Hex(url));
    const cacheKind = `tool_analyse:${toolKey}`;

    const ctx = body.context ?? {};
    const profileHash = currentProfileHash(ctx as Record<string, unknown>);

    // Cache check
    if (!body.force) {
      const { data: existing } = await supabase
        .from("ai_summaries")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (existing?.payload) {
        const cached = existing.payload as ToolAnalysisPayload & { _profile_snapshot_hash?: string };
        const versionOk = provider === "claude"
          ? cached._model_version === MODEL_VERSION && cached._provider === "claude"
          : cached._provider !== "claude" && cached._model_version === LOVABLE_MODEL_VERSION;
        const hashOk = cached._profile_snapshot_hash === profileHash;
        if (versionOk && hashOk) {
          return jsonResp(200, await sanitiseAndLog(cached, "tool-analyse-url"));
        }
      }
    }

    const t0 = Date.now();
    console.log(JSON.stringify({ tag: "tool-debug", phase: "start", url, provider, profileHash }));

    let analysis: Record<string, unknown>;

    if (provider === "claude") {
      console.log(JSON.stringify({ tag: "tool-debug", phase: "before prefetch", ms: Date.now() - t0 }));
      const resolvedUrl = await resolveShortLink(url);
      const pre = await prefetchPage(resolvedUrl);
      const extractedImage = pre.imageUrl ?? (await fetchOgImageOnly(resolvedUrl));
      console.log(JSON.stringify({ tag: "tool-debug", phase: "before model", ms: Date.now() - t0 }));
      const claudeRes = await runClaude({
        url: resolvedUrl,
        context: ctx as Record<string, unknown>,
        selectorContext: buildSelectorContext(body),
        pageTitle: pre.title,
        pageText: pre.text,
      });
      const { payload, web_search_invocations, web_fetch_invocations } = claudeRes;

      console.log(JSON.stringify({
        tag: "tool-debug", phase: "model call done", ms: Date.now() - t0,
        used_web_fetch: web_fetch_invocations > 0,
        used_web_search: web_search_invocations > 0,
        web_fetch_invocations, web_search_invocations,
      }));
      analysis = {
        ...payload,
        // Back-compat fields the existing client (MyToolsSection.tsx) reads.
        is_tool: true,
        name: payload.tool_name,
        summary: payload.ai_summary,
        category: mapKindToLegacyCategory(payload.tool_kind),
        _model_version: MODEL_VERSION,
        _generated_at: new Date().toISOString(),
        _provider: "claude",
        _used_web_search: web_search_invocations > 0,
        _web_search_count: web_search_invocations,
        _used_web_fetch: web_fetch_invocations > 0,
      };
      const ogImage = await isSubstantialRemoteImage(extractedImage)
        ? extractedImage
        : await findExactProductImage(payload.brand, payload.tool_name, Deno.env.get("FIRECRAWL_API_KEY"));
      if (ogImage) {
        const safeImg = ogImage.startsWith("http://") ? "https://" + ogImage.slice(7) : ogImage;
        analysis._source_image_url = safeImg;
        analysis.image_url = safeImg;
      }
    } else {
      console.log(JSON.stringify({ tag: "tool-debug", phase: "before lovable", ms: Date.now() - t0 }));
      const { payload, image_url: extractedImage } = await runLovable({ url, context: ctx as Record<string, unknown> });
      const image_url = await isSubstantialRemoteImage(extractedImage)
        ? extractedImage
        : await findExactProductImage(payload.brand, payload.name ?? payload.tool_name, Deno.env.get("FIRECRAWL_API_KEY"));
      console.log(JSON.stringify({
        tag: "tool-debug", phase: "lovable done", ms: Date.now() - t0,
        og_image: image_url ? "yes" : "no",
      }));
      analysis = {
        ...payload,
        _provider: "lovable",
        _model_version: LOVABLE_MODEL_VERSION,
        _generated_at: new Date().toISOString(),
      };
      if (image_url && !analysis.image_url) {
        const safeImg = image_url.startsWith("http://") ? "https://" + image_url.slice(7) : image_url;
        analysis._source_image_url = safeImg;
        analysis.image_url = safeImg;
      }
    }
    {
      // Level-aware caps (1-2 -> 2 items, 3 -> 3, 4 -> 4), then make the score
      // agree with its own working — same contract as the product paths.
      const cap = levelCap(coerceTipsLevel((ctx as Record<string, unknown>).tipsLevel));
      const a = analysis as Record<string, unknown>;
      if (Array.isArray(a.use_cases)) a.use_cases = (a.use_cases as unknown[]).slice(0, cap);
      if (Array.isArray(a.tips)) a.tips = (a.tips as unknown[]).slice(0, cap);
      if (Array.isArray(a.key_features)) a.key_features = (a.key_features as unknown[]).slice(0, cap);

      const reasons = sanitiseScoreReasons(a.score_reasons);
      a.score_reasons = reasons;
      if (typeof a.match_score === "number") {
        a.match_score = alignScoreWithReasons(
          Math.max(0, Math.min(100, Math.round(a.match_score as number))),
          reasons,
        );
      }
      if (reasons.length >= 2) {
        const one = firstSentence(a.ai_summary ?? a.summary);
        if (one) {
          a.ai_summary = one;
          a.summary = one;
        }
      }
    }

    analysis._profile_snapshot_hash = profileHash;
    console.log(JSON.stringify({ tag: "tool-debug", phase: "all done", total_ms: Date.now() - t0 }));

    // Upsert cache
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
      JSON.stringify(await sanitiseAndLog(analysis, "tool-analyse-url")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return aiErrorResponse(e, "tool-analyse-url");
  }
});

// Map the new tool_kind enum to the legacy category strings the client uses.
function mapKindToLegacyCategory(kind: string): string {
  const m: Record<string, string> = {
    heat_cap: "TT Heat Hat",
    deep_conditioning_cap: "TT Heat Hat",
    hair_dryer: "Hair dryer",
    blow_dryer: "Hair dryer",
    hooded_dryer: "Hair dryer",
    diffuser: "Diffuser",
    flat_iron: "Hot tools (curler / wand)",
    curling_iron: "Hot tools (curler / wand)",
    curling_wand: "Hot tools (curler / wand)",
    brush: "Brush",
    comb: "Comb",
    detangler: "Comb",
    steamer: "Other",
    scalp_massager: "Other",
    microfiber_towel: "Microfibre / T-shirt towel",
    satin_bonnet: "Bonnet / silk scarf",
    satin_pillowcase: "Satin pillowcase",
    other: "Other",
  };
  return m[kind] ?? "Other";
}

// Touch ref so unused-var lint doesn't trip on TOOL_KIND_ENUM / CHAPTER_WHITELIST_PROMPT.
void TOOL_KIND_ENUM;
void CHAPTER_WHITELIST_PROMPT;
