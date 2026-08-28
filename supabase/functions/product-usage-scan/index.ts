// Reads the usage directions off a product's own packaging and returns them as
// plain instruction text, so a member building a treatment plan doesn't have to
// type out the back of the bottle.
//
// Deliberately thin: no ingredients, no analysis, no scoring, no storage. The
// client drops the text straight into the usage-notes field for her to edit —
// this function never writes anything anywhere.
//
// Request:  { image: { data: base64, mime: string } }
// Response: { text: string }
import { json, preflight } from "../_shared/cors.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";

const AI_METER_META = { function_name: "product-usage-scan", stage: 2 } as const;

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const SYSTEM_PROMPT = `You read a photograph of a hair product's packaging and extract ONLY the usage directions — the "how to use" / "directions" text.

RULES:
- Return the directions as one short plain-text instruction, at most 320 characters, in normal sentence case.
- Keep any amount, frequency or placement the pack actually states (e.g. "a coin-sized amount", "on damp hair", "leave for 5 minutes", "rinse thoroughly", "twice a week").
- Do NOT return the ingredient list, INCI panel, warnings, batch codes, barcodes, prices, or marketing claims.
- Do NOT add advice, benefits, or steps the pack does not state. Never invent an amount, a frequency or a placement.
- If the photo shows no readable usage directions, return an empty string.

Return ONLY valid JSON matching: { "text": string }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    if (!req.headers.get("Authorization")) return json(401, { error: "Missing authorization" });

    const body = await req.json().catch(() => null) as
      | { image?: { data?: string; mime?: string } }
      | null;
    const data = body?.image?.data;
    const mime = body?.image?.mime;
    if (!data || !mime) return json(400, { error: "image needs data (base64) and mime" });
    if (!mime.startsWith("image/")) return json(400, { error: `Unsupported file type: ${mime}` });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const gwRes = await gatewayFetch(
      AI_METER_META,
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract the usage directions from this packaging. Return JSON only.",
                },
                { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!gwRes.ok) {
      const details = await gwRes.text();
      console.error(`product-usage-scan gateway error [${gwRes.status}]: ${details}`);
      return json(gwRes.status, { error: "AI gateway error", details });
    }

    const gwJson = await gwRes.json();
    const content = gwJson?.choices?.[0]?.message?.content;
    let parsed: { text?: unknown } = {};
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content ?? {};
    } catch {
      console.error("product-usage-scan unparseable JSON:", content);
      return json(500, { error: "Model returned unparseable JSON" });
    }

    const text = String(parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 320);
    return json(200, { text });
  } catch (e) {
    console.error("product-usage-scan failed", e);
    return json(500, { error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
