// PHASE A — LABEL READ ONLY (2026-09-04).
//
// The product scan used to do everything in one worker invocation: read the
// label, retrieve manuscript passages, write per-ingredient mechanisms, run the
// guardrail loop, score against her profile and deliver. That does not fit in a
// single invocation and the worker was being killed on CPU at 45-75s, so the
// member saw an error after a long wait.
//
// This endpoint does ONE thing and returns in a few seconds: read both sides of
// the pack and report what is printed — brand, product name, the ingredient
// panel, the category, where it goes and the directions. It is a pure
// EXTRACTION endpoint, exactly like supplement-extract / blood-extract:
//   - no advice, no mechanisms, no manuscript claims, no persona copy,
//   - therefore no grounding block and no guidance guardrails are needed here,
//     because nothing it returns is guidance.
//
// Everything that IS guidance — grounding in How To Love Your Afro, the
// sanitiser, the citation/violation log, the caution bar, the closed
// vocabulary, the relationship checks and the scoring — runs unchanged in
// PHASE B (`ingredient-analysis`), started by `product-analysis-start`.

import { json, preflight } from "../_shared/cors.ts";
import { requireEntitledUser } from "../_shared/entitlement.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap } from "../_shared/usage-cap.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const AI_METER_META = { function_name: "product-label-read", stage: 2 } as const;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION_MODEL = "google/gemini-3.7-flash";

const SYSTEM =
  `You read the two photos of a hair product and report EXACTLY what is printed on the pack.

Return strict JSON only:
{"brand": string|null, "product_name": string|null, "ingredients": string[], "category": string|null, "application_area": string|null, "leave_on": boolean|null, "usage_instructions": string|null, "label_readable": boolean}

Rules:
- brand / product_name: as printed on the front. Never invent, never expand an abbreviation you cannot see.
- ingredients: the INCI panel from the back, in the printed order, one entry per ingredient, spelling as printed. Do not merge two ingredients, do not drop one because it is small print, do not add one that is not printed. If no panel is legible, return [].
- category: a plain description of what it is (shampoo, conditioner, leave-in, gel, oil, mask, scalp treatment...). null if unclear.
- application_area: EXACTLY one of "scalp", "lengths_ends", "scalp_and_lengths", "rinse_out", "unknown" — whichever the pack's own directions support. Use "unknown" when the pack does not say.
- leave_on: true if it stays on the hair, false if it is rinsed out, null if not stated.
- usage_instructions: the directions text as printed, verbatim and trimmed. null if none is legible.
- label_readable: false only when you genuinely could not read the pack.
- You are reporting a label. Add no advice, no verdict, no commentary, no hair typing terminology.`;

interface Body {
  photos?: { front?: string; back?: string };
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || /^(null|unknown|n\/a)$/i.test(t)) return null;
  return t.slice(0, max);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const kill = checkKillSwitch();
  if (kill) return kill;

  const startedAt = Date.now();
  const auth = await requireEntitledUser(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const front = body.photos?.front;
  const back = body.photos?.back;
  if (!front || !back) {
    return json(400, {
      error:
        "We need both photos — the front of the pack for the brand and name, and the back for the ingredient panel.",
    });
  }

  const capped = await checkDailyCap(user.id, "product-label-read", 40);
  if (capped) return capped;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json(500, { error: "AI is not configured" });

  let res: Response;
  try {
    res = await gatewayFetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "First photo: the front of the pack. Second photo: the back, with the ingredient panel. " +
                  "Read both and return the JSON described in your instructions.",
              },
              { type: "image_url", image_url: { url: front } },
              { type: "image_url", image_url: { url: back } },
            ],
          },
        ],
      }),
      // Phase A must never be the thing a member waits on. If the read is not
      // back well inside the request, we fail fast with a retryable message.
      signal: AbortSignal.timeout(30_000),
    }, AI_METER_META);
  } catch (e) {
    console.error("[product-label-read] gateway threw", e);
    return json(503, { error: "The label read timed out. Try that photo again." });
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    console.error(`[product-label-read] gateway ${res.status}: ${detail}`);
    if (res.status === 429) return json(429, { error: "We're busy right now — try again in a moment." });
    if (res.status === 402 || res.status === 403) {
      return json(res.status, { error: "AI is unavailable on this account right now." });
    }
    return json(502, { error: "We couldn't read that label. Try both photos again." });
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseJsonLoose(raw);
  if (!parsed) {
    console.error("[product-label-read] unparseable model output", raw.slice(0, 300));
    return json(502, { error: "We couldn't read that label. Try both photos again." });
  }

  const ingredients = Array.isArray(parsed.ingredients)
    ? (parsed.ingredients as unknown[])
      .map((i) => (typeof i === "string" ? i.trim() : ""))
      .filter((i) => i.length > 0 && i.length < 120)
      .slice(0, 200)
    : [];

  const out = {
    brand: str(parsed.brand, 80),
    product_name: str(parsed.product_name, 160),
    ingredients,
    category: str(parsed.category, 60),
    application_area: str(parsed.application_area, 80),
    leave_on: typeof parsed.leave_on === "boolean" ? parsed.leave_on : null,
    usage_instructions: str(parsed.usage_instructions, 1200),
    label_readable: parsed.label_readable !== false && (!!str(parsed.product_name, 160) || ingredients.length > 0),
    elapsed_ms: Date.now() - startedAt,
  };

  console.log(JSON.stringify({
    function: "product-label-read",
    event: "phase_a_complete",
    elapsed_ms: out.elapsed_ms,
    ingredient_count: ingredients.length,
    has_identity: !!(out.brand || out.product_name),
    label_readable: out.label_readable,
  }));

  return json(200, out);
});
