// Reads a member's OWN written recipe (notecard, handwritten label, notes-app
// screenshot) and returns structured recipe rows for her to review.
//
// Deliberately NOT the packaged-product scan: there is no brand, no INCI panel
// and no marketing copy to read — just what she wrote down. The output feeds the
// SAME structured rows as the manual form (ingredient + qty + unit, with a
// free-text amount fallback), and NOTHING is ever saved from here: the client
// populates the form so she can correct a misread "2" that was really a "z".
//
// Request:  { image: { data: base64, mime: string } }
// Response: { name: string | null, items: Array<{ ingredient, qty, unit, amount_text }> }
import { json, preflight } from "../_shared/cors.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";

const AI_METER_META = { function_name: "homemade-recipe-scan", stage: 2 } as const;

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

/** Must stay in step with RECIPE_UNITS in src/lib/homemade.ts. */
const UNITS = ["g", "ml", "tsp", "tbsp", "cup", "drops", "pumps"] as const;

const SYSTEM_PROMPT = `You read a photograph of a homemade hair-product recipe that the user wrote themselves — a notecard, a handwritten jar label, a page from a notebook, or a screenshot of a notes app. Extract the ingredient list.

RULES:
- One row per ingredient. Keep the ingredient name close to what is written, tidied to normal spelling and lower case (e.g. "SHEA BUTTER" -> "shea butter", "aloe vera gel").
- When a clear, countable measurement is written, return it split into qty (digits only, e.g. "2", "0.5", "1/2" is allowed) and unit, where unit is EXACTLY one of: ${UNITS.join(", ")}. Map common spellings: gram/grams/g -> g; millilitre/ml -> ml; teaspoon/tsp/t -> tsp; tablespoon/tbsp/T -> tbsp; cup/cups -> cup; drop/drops -> drops; pump/pumps -> pumps.
- When the amount is NOT one of those units (e.g. "a handful", "a pinch", "a big dollop", "half a jar"), leave qty and unit empty and put her words in amount_text.
- When no amount is written at all, leave qty, unit and amount_text all empty strings. Never invent an amount.
- Ignore method/instruction lines ("mix well", "apply to ends", "leave 20 mins"), dates, and titles — those are not ingredients.
- If a title or product name is written (e.g. "shea & aloe mask"), return it as name. Otherwise name is null. Never invent one.
- If the photo contains no readable recipe, return an empty items array.
- Never guess an unreadable word into something plausible: if a word cannot be read, omit that row.

Return ONLY valid JSON matching:
{ "name": string | null, "items": [ { "ingredient": string, "qty": string, "unit": string, "amount_text": string } ] }`;

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
                { type: "text", text: "Extract the recipe from this photo. Return JSON only." },
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
      console.error(`homemade-recipe-scan gateway error [${gwRes.status}]: ${details}`);
      return json(gwRes.status, { error: "AI gateway error", details });
    }

    const gwJson = await gwRes.json();
    const content = gwJson?.choices?.[0]?.message?.content;
    let parsed: { name?: unknown; items?: unknown } = {};
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content ?? {};
    } catch {
      console.error("homemade-recipe-scan unparseable JSON:", content);
      return json(500, { error: "Model returned unparseable JSON" });
    }

    const unitSet = new Set<string>(UNITS);
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const ingredient = String(r.ingredient ?? "").trim().slice(0, 180);
        if (!ingredient) return null;
        const unitRaw = String(r.unit ?? "").trim().toLowerCase();
        const unit = unitSet.has(unitRaw) ? unitRaw : "";
        // Digits, decimal points and simple fractions only — anything else is a
        // misread, and a wrong number is worse than no number.
        const qtyRaw = String(r.qty ?? "").trim().replace(/[^\d.,/]/g, "");
        const qty = unit && /\d/.test(qtyRaw) ? qtyRaw.slice(0, 8) : "";
        const amount_text = unit ? "" : String(r.amount_text ?? "").trim().slice(0, 80);
        return { ingredient, qty, unit, amount_text };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 80);

    const nameRaw = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 80) : "";

    return json(200, { name: nameRaw || null, items });
  } catch (e) {
    console.error("homemade-recipe-scan failed", e);
    return json(500, { error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
