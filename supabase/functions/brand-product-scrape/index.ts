// Brand — fetch a product URL and use Lovable AI to draft a STRAND product
// page (name, description, image URLs, ingredients). Brand reviews/edits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { url, kind: rawKind } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: corsHeaders });
    }
    const kind: "product" | "tool" = rawKind === "tool" ? "tool" : "product";

    // Fetch the page HTML
    let html = "";
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 STRAND-bot" } });
      html = (await res.text()).slice(0, 60_000);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Fetch failed" }), { status: 502, headers: corsHeaders });
    }

    // Strip scripts/styles and collapse whitespace
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 20_000);

    // Grab og:image and product images for imagery hints
    const imgMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map((m) => m[1]).slice(0, 6);
    const ogImg = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const images = Array.from(new Set([ogImg, ...imgMatches].filter(Boolean))) as string[];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const productPrompt = `You are drafting an in-app product page from a real product page. Return STRICT JSON:
{"name": "...", "description": "...", "ingredients": ["INCI 1","INCI 2"], "external_url": "${url}"}

Rules:
- description: 2-3 sentence, factual, brand-neutral summary of what the product is and does. No marketing hype.
- ingredients: full INCI list if present on the page. Otherwise return [].
- No commentary outside JSON.

PAGE TEXT:
${clean}`;

    // Tool prompt — no ingredients. Mirrors _shared/tool-schema.ts fields the
    // rest of the app uses for tools (tool_kind + key_features + materials).
    const toolPrompt = `You are drafting an in-app tool page (hair-care tool: brush, comb, bonnet, heat cap, dryer, etc.) from a real product page. Return STRICT JSON:
{"name": "...", "description": "...", "tool_kind": "brush | comb | bonnet | heat_cap | hair_dryer | diffuser | flat_iron | curling_wand | pillowcase | microfibre_towel | scissors | sectioning_clips | other", "key_features": ["..."], "materials": ["..."], "external_url": "${url}"}

Rules:
- description: 2-3 sentence, factual, brand-neutral summary of what the tool is and does. No marketing hype.
- tool_kind: choose the single best fit from the list above based on the page.
- key_features: 3-6 concise bullet points of tangible attributes (heat range, bristle type, dryer wattage, ionic tech, size, etc.). No marketing hype.
- materials: physical materials/fabric where stated (e.g. "satin", "boar bristle", "ceramic plates"). Empty array if absent.
- Do NOT return an ingredients field. This is a tool, not a formulated product.
- No commentary outside JSON.

PAGE TEXT:
${clean}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: kind === "tool" ? toolPrompt : productPrompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${txt.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: {
      name?: string;
      description?: string;
      ingredients?: string[];
      tool_kind?: string;
      key_features?: string[];
      materials?: string[];
      external_url?: string;
    } = {};
    try { parsed = JSON.parse(content); } catch { /* keep empty */ }

    // Unified response shape: { item: {...}, kind }. Older callers reading
    // `product` still work for kind='product' via the compat alias below.
    const item = {
      name: parsed.name ?? "",
      description: parsed.description ?? "",
      external_url: parsed.external_url ?? url,
      image_urls: images,
      kind,
      ingredients: kind === "product" && Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      tool_kind: kind === "tool" ? (parsed.tool_kind ?? null) : null,
      key_features: kind === "tool" && Array.isArray(parsed.key_features) ? parsed.key_features : [],
      materials: kind === "tool" && Array.isArray(parsed.materials) ? parsed.materials : [],
    };

    return new Response(
      JSON.stringify({ kind, item, product: kind === "product" ? item : undefined, tool: kind === "tool" ? item : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
