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

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: corsHeaders });
    }

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

    const prompt = `You are drafting an in-app product page from a real product page. Return STRICT JSON:
{"name": "...", "description": "...", "ingredients": ["INCI 1","INCI 2"], "external_url": "${url}"}

Rules:
- description: 2-3 sentence, factual, brand-neutral summary of what the product is and does. No marketing hype.
- ingredients: full INCI list if present on the page. Otherwise return [].
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
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${txt.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { name?: string; description?: string; ingredients?: string[]; external_url?: string } = {};
    try { parsed = JSON.parse(content); } catch { /* keep empty */ }

    return new Response(
      JSON.stringify({
        product: {
          name: parsed.name ?? "",
          description: parsed.description ?? "",
          ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
          external_url: parsed.external_url ?? url,
          image_urls: images,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
