// SUPPLEMENT EXTRACT — reads a supplement bottle photo or a product page link
// and returns the supplement's name, dose and frequency as printed.
//
// This is a pure EXTRACTION endpoint, not a guidance endpoint: it reports what
// the label or page says and nothing else. No advice, no manuscript claims, no
// persona copy — so it deliberately carries none of the guidance grounding.
// Anything the member is taking is fed into nutrition-plan afterwards, where
// the usual manuscript-grounding rules apply.
//
// Retrieval reuses the shared page pipeline (_shared/page-scrape.ts) — the same
// plain-fetch → Firecrawl fallback the product URL flow uses — and the shared
// SSRF guard for caller-supplied URLs.

import { json, preflight } from "../_shared/cors.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { assertPublicHttpUrl } from "../_shared/ssrf.ts";
import { scrapePage } from "../_shared/page-scrape.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM = `You read supplement labels and supplement product pages and report EXACTLY what they say.

Return strict JSON only:
{"name": string, "dose": string|null, "frequency": string|null}

Rules:
- name: the supplement itself, as a person would say it (e.g. "Vitamin D3", "Magnesium Glycinate", "Omega-3 Fish Oil"). Include the brand only when the name is meaningless without it. Max 60 characters.
- dose: the strength per serving as printed (e.g. "1000 IU", "400 mg"). null if not stated.
- frequency: how often the label says to take it (e.g. "Once daily", "Twice daily with food"). null if not stated.
- Never guess, never infer a dose that is not printed, never add advice or commentary.
- If the input is not a supplement at all, return {"name": "", "dose": null, "frequency": null}.`;

interface Body {
  url?: string;
  image_data_url?: string;
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "unknown") return null;
  return t.slice(0, max);
};

Deno.serve(async (req: Request) => {
  const pre = preflight();
  if (req.method === "OPTIONS") return pre;

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json(500, { error: "AI is not configured" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userContent: unknown;
  let sourceUrl: string | null = null;

  if (body.url) {
    const safe = await assertPublicHttpUrl(body.url);
    if ("error" in safe) return json(400, { error: "That link can't be read." });
    const url = safe.url.toString();
    sourceUrl = url;
    const page = await scrapePage(url);
    if (!page.text || page.text.length < 80) {
      return json(
        502,
        { error: "Couldn't read that page. Try a photo of the bottle instead, or add it by name." },
      );
    }
    userContent = `Supplement product page.
URL: ${url}
Title: ${page.title}

Page text (truncated):
"""
${page.text.slice(0, 7000)}
"""

Return the JSON described in your instructions.`;
  } else if (body.image_data_url) {
    if (!/^data:image\/[a-z+]+;base64,/i.test(body.image_data_url)) {
      return json(400, { error: "That photo couldn't be read." });
    }
    userContent = [
      { type: "text", text: "Read this supplement label and return the JSON described in your instructions." },
      { type: "image_url", image_url: { url: body.image_data_url } },
    ];
  } else {
    return json(400, { error: "Send either a link or a photo." });
  }

  let resp: Response;
  try {
    resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.error("[supplement-extract] gateway call failed", e);
    return json(502, { error: "Couldn't read that just now. Please try again." });
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[supplement-extract] gateway error", resp.status, text.slice(0, 400));
    if (resp.status === 429) return json(429, { error: "Too many requests just now — try again in a moment." });
    if (resp.status === 402) return json(402, { error: "AI credits are needed to read labels." });
    return json(502, { error: "Couldn't read that just now. Please try again." });
  }

  const payload = await resp.json();
  const raw = payload?.choices?.[0]?.message?.content;
  const parsed = typeof raw === "string" ? parseJsonLoose(raw) : null;
  const name = str(parsed?.name, 60);
  if (!name) {
    return json(422, {
      error: "We couldn't tell which supplement that is. Try a clearer photo of the front label, or add it by name.",
    });
  }

  return json(200, {
    name,
    dose: str(parsed?.dose, 40),
    frequency: str(parsed?.frequency, 60),
    source_url: sourceUrl,
  });
});
