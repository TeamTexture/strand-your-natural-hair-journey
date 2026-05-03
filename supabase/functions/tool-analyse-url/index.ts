// Analyses a hair-tool URL for THIS user. Phase 2 Step 4b: dual-path —
// Lovable+Gemini (legacy, Firecrawl-scraped) and Claude (new, native
// web_fetch + web_search), gated by STRAND_AI_PROVIDER_TOOL_URL.
//
// Mirrors product-analyse-url architecture. Tools have NO ingredients, so
// the schema is smaller — see _shared/tool-schema.ts.

import { corsHeaders } from "../_shared/cors.ts";
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
  RETURN_TOOL_ANALYSIS_SCHEMA,
  TOOL_KIND_ENUM,
  type ToolAnalysisPayload,
} from "../_shared/tool-schema.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";
import { currentProfileHash } from "../_shared/profile-snapshot.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL_VERSION = "claude-haiku-4-5@v1";
const INVALID_URL_MESSAGE = "STRAND needs a valid product page URL to analyse.";

// Legacy categories the Lovable path returns (kept stable for back-compat with
// MyToolsSection.tsx which matches against TOOL_CATEGORIES on the client).
const LEGACY_TOOL_CATEGORIES = [
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

interface RequestBody {
  url?: string;
  toolKey?: string;
  context?: Record<string, unknown> & {
    hairProfile?: Record<string, unknown>;
    healthProfile?: Record<string, unknown>;
    bloodResults?: unknown[];
    location?: { is_hard_water_area?: boolean | null };
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
    location: ctx.location ?? {},
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
function buildTaskInstructions(): string {
  return `You are receiving a hair-care TOOL product page URL (brushes, combs, hair dryers, diffusers, heat caps, deep conditioning caps, bonnets, satin pillowcases, microfibre towels, steamers, curlers, wands, etc.). Use web_fetch to retrieve the page. Extract the basic identity (brand, tool name, classification) and produce a short personalised analysis for THIS user.

Voice for this task: every prose field follows the VOICE PRINCIPLES from the system block. Explain the tool's mechanism first ("a heated cap holds warmth against the scalp, which means…"), then land the verdict; use connectives; talk to "you" not "your hair"; translate any specialist term on first use in a field; warm but not saccharine.

Tool budget: web_fetch and web_search share a combined cap of 4 invocations. Prefer ONE web_fetch on the supplied URL first. Only fall back to web_search (max 2) if web_fetch returned a thin/empty body. Do NOT search if web_fetch returned a clear brand + product name + tool kind.

Field rules — strict:
- tool_name / brand: extracted from the page title, h1, or breadcrumbs. NEVER invent. If unable to determine confidently after fetch + search, return the closest readable text and start ai_summary with "Couldn't fully read the page —".
- tool_kind: pick the single best match from the enum. Use these disambiguation rules:
   * "deep_conditioning_cap" — caps/hats/cordless heated caps designed to deliver heat to a deep conditioner / mask. Look for "deep conditioning", "heat cap", "hot head", "thermal cap", "microwaveable cap". NOT a bonnet.
   * "heat_cap" — generic heat-only cap not tied to deep conditioning.
   * "satin_bonnet" — sleep bonnet / silk or satin scarf. NOT heated.
   * "hooded_dryer" — large standalone hooded dryer.
   * "diffuser" — attachment for a hand-held dryer (NOT the dryer itself).
   * "blow_dryer" / "hair_dryer" — hand-held dryer.
   * Use "other" only if none clearly apply.
- ai_summary: 2–3 sentences MAX, lead with the verdict (good fit / mixed fit / poor fit and why) referencing THIS user's CURRENT style, goal, or challenge in sentence one. Paige's voice, second person.
- key_features: MAX 4. Each item is { name, relevance } — only include features whose relevance ties back to the user's hair type, current style, goal, or a challenge directly addressed by the tool's mechanism.
- use_cases: MAX 2 items, each ≤ 1 short sentence. Pick the 2 most actionable ways THIS user should use the tool given their profile.
- tips: MAX 2 items, each ≤ 1 short sentence. The 2 most relevant personal signals for THIS tool.
- warnings: optional, MAX 2. Only include if the tool has a contraindication for THIS user (e.g. high heat tool when user has a heat-damage challenge).
- personalisation_rationale: 1–2 sentences explaining why this tool does or doesn't suit THIS user's hair profile.

Citation rule: when guidance is rooted in the book, use the formal "Read more — How To Love Your Afro, Chapter [X]: [Title], p.[page]" line on its own line at the end of ai_summary. Web-derived facts go inline, never under "Read more —".

PRODUCT/TOOL ANALYSIS SCOPE — HARD RULE:
Focus ONLY on signals that intersect with what the tool DOES (mechanism, heat, tension, surface contact, materials). Do NOT cite:
- Tension/styling concerns unless the tool's mechanism is tension-related (e.g. don't cite tight braids when discussing a satin pillowcase).
- Lab values, sleep, cortisol, dermatologist context unless the tool's mechanism directly addresses them.

Hair-health guidance only — never medical advice.`;
}

// ─── Provider: Claude ──────────────────────────────────────────────────
async function runClaude(args: {
  url: string;
  context: Record<string, unknown>;
  selectorContext: SelectorContext;
}): Promise<{
  payload: ToolAnalysisPayload;
  web_search_invocations: number;
  web_fetch_invocations: number;
}> {
  const userText = `Hair-tool product page URL to analyse: ${args.url}

Use web_fetch on this URL first. If thin/gated, fall back to web_search (combined cap of 4). Return JSON only via the return_tool_analysis tool.

User context (use to compute personalisation, ai_summary, use_cases, tips):
${JSON.stringify(args.context ?? {}, null, 2)}`;

  const userContent: ContentBlockInput[] = [{ type: "text", text: userText }];

  const webFetchTool: ServerTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2 };
  const webSearchTool: ServerTool = { type: "web_search_20250305", name: "web_search", max_uses: 2 };

  const req = await buildClaudeRequest({
    function_kind: "tool-analyse-url",
    task_instructions: buildTaskInstructions(),
    user_payload: {},
    user_content: userContent,
    user_context: args.context,
    selector_context: args.selectorContext,
    force_topic_ids: ["porosity", "scalp-conditions", "heat-and-moisture", "protective-styling"],
    tool: {
      name: "return_tool_analysis",
      description:
        "Return the structured tool analysis. Always invoke this tool exactly once at the end with the final analysis.",
      input_schema: RETURN_TOOL_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    },
    server_tools: [webFetchTool, webSearchTool],
    max_tokens: 2048,
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

const LOVABLE_SYSTEM = `${STRAND_PERSONA}

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
3. category MUST be one of: ${LEGACY_TOOL_CATEGORIES.join(", ")}.
4. summary: 1–2 short sentences describing what this tool does and who it's
   good for, in Paige's voice. Plain English, second person.
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
    const u = new URL(candidate, baseUrl).toString();
    return u.startsWith("http://") ? "https://" + u.slice(7) : u;
  } catch { return null; }
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
    const metadata = inner?.metadata as { title?: string; ogImage?: string; "og:image"?: string } | undefined;
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

async function runLovable(args: {
  url: string;
  context: Record<string, unknown>;
}): Promise<{ payload: Record<string, unknown>; image_url: string | null }> {
  const aiApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!aiApiKey) throw new Error("LOVABLE_API_KEY not configured");
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  let scraped: ScrapeResult | null = null;
  if (firecrawlKey) scraped = await scrapeWithFirecrawl(args.url, firecrawlKey);
  if (!scraped) scraped = await scrapeWithFetch(args.url);
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
        currentChallenges: goalsArr.map((g) => g.challenge).filter(Boolean),
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
          : cached._provider !== "claude";
        const hashOk = cached._profile_snapshot_hash === profileHash;
        if (versionOk && hashOk) {
          return jsonResp(200, sanitiseChapterCitationsDeep(cached));
        }
      }
    }

    const t0 = Date.now();
    console.log(JSON.stringify({ tag: "tool-debug", phase: "start", url, provider, profileHash }));

    let analysis: Record<string, unknown>;

    if (provider === "claude") {
      console.log(JSON.stringify({ tag: "tool-debug", phase: "before web_fetch", ms: Date.now() - t0 }));
      const [claudeRes, ogImage] = await Promise.all([
        runClaude({ url, context: ctx as Record<string, unknown>, selectorContext: buildSelectorContext(body) }),
        fetchOgImageOnly(url),
      ]);
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
      if (ogImage) {
        const safeImg = ogImage.startsWith("http://") ? "https://" + ogImage.slice(7) : ogImage;
        analysis._source_image_url = safeImg;
        analysis.image_url = safeImg;
      }
    } else {
      console.log(JSON.stringify({ tag: "tool-debug", phase: "before lovable", ms: Date.now() - t0 }));
      const { payload, image_url } = await runLovable({ url, context: ctx as Record<string, unknown> });
      console.log(JSON.stringify({
        tag: "tool-debug", phase: "lovable done", ms: Date.now() - t0,
        og_image: image_url ? "yes" : "no",
      }));
      analysis = {
        ...payload,
        _provider: "lovable",
        _generated_at: new Date().toISOString(),
      };
      if (image_url && !analysis.image_url) {
        const safeImg = image_url.startsWith("http://") ? "https://" + image_url.slice(7) : image_url;
        analysis._source_image_url = safeImg;
        analysis.image_url = safeImg;
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
      JSON.stringify(sanitiseChapterCitationsDeep(analysis)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return aiErrorResponse(e, "tool-analyse-url");
  }
});

// Map the new tool_kind enum to the legacy category strings the client uses.
function mapKindToLegacyCategory(kind: string): string {
  const m: Record<string, string> = {
    heat_cap: "Deep conditioning cap / heat hat",
    deep_conditioning_cap: "Deep conditioning cap / heat hat",
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
    steamer: "Steamer",
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
