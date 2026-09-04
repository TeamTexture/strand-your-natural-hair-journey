// PHASE A — LABEL READ ONLY (2026-09-04, reverted to the proven read path
// 2026-09-04 later the same day).
//
// The product scan used to do everything in one worker invocation: read the
// label, retrieve manuscript passages, write per-ingredient mechanisms, run the
// guardrail loop, score against her profile and deliver. That does not fit in a
// single invocation and the worker was being killed on CPU, so the member saw
// an error after a long wait. The split is right and stays.
//
// REGRESSION FIXED. The first version of this endpoint read the label with a
// DIFFERENT engine to the one that had been reading labels successfully for
// months: Gemini through the chat-completions gateway, strict-JSON-in-prose,
// max_tokens 2000, a hard 30s abort, and no second pass when the pack could not
// be resolved. Long INCI panels and curved back-of-bottle panels failed on it.
// This file is now back to the previously working read: Claude Sonnet 4.6
// vision, the same base64/URL image blocks, a tool-shaped result so the JSON
// can never arrive half-written as prose, max_tokens 8192, no client-side
// abort, and the same search-gated second pass the old path had.
//
// It is still a pure EXTRACTION endpoint — it reports what is printed on the
// pack: brand, product name, the ingredient panel, category, where it goes and
// the directions. No advice, no mechanisms, no manuscript claims, no persona
// copy, therefore no grounding block and no guidance guardrails apply here.
//
// Everything that IS guidance — grounding in the manuscript, the sanitiser,
// the citation/violation log, the caution bar, the closed vocabulary, the
// relationship checks and the scoring — runs unchanged in PHASE B
// (`ingredient-analysis`), started by `product-analysis-start`.

import { json, preflight } from "../_shared/cors.ts";
import { requireEntitledUser } from "../_shared/entitlement.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap } from "../_shared/usage-cap.ts";
import {
  callClaude,
  ClaudeError,
  type ContentBlockInput,
  type ImageBlockSource,
  type ServerTool,
} from "../_shared/anthropic-client.ts";
import { decidePhotoSearch, needsSearchRetry } from "../_shared/search-gate.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const AI_METER_META = { function_name: "product-label-read", stage: 2 } as const;
const VISION_MODEL = "claude-sonnet-4-6" as const;

/** Same conversion the working photo path used: data URLs become base64 image
 *  blocks, signed URLs are passed as url blocks. No downscaling, no
 *  re-encoding — the model sees the photo the member took. */
function toAnthropicImageSource(image_url: string): ImageBlockSource {
  const dataMatch = image_url.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i,
  );
  if (dataMatch) {
    const media_type = dataMatch[1].toLowerCase() as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/gif";
    return { type: "base64", media_type, data: dataMatch[2] };
  }
  return { type: "url", url: image_url };
}

const LABEL_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: ["string", "null"], description: "Brand as printed on the front. Never invented." },
    product_name: { type: ["string", "null"], description: "Product name as the brand calls it." },
    ingredients: {
      type: "array",
      items: { type: "string" },
      description:
        "The complete INCI panel in printed order, one entry per ingredient, spelled exactly as printed. Empty array when no panel is legible.",
    },
    category: { type: ["string", "null"], description: "shampoo, conditioner, leave-in, gel, oil, mask, scalp treatment..." },
    application_area: {
      type: ["string", "null"],
      enum: ["scalp", "lengths_ends", "scalp_and_lengths", "rinse_out", "unknown", null],
    },
    leave_on: { type: ["boolean", "null"] },
    usage_instructions: {
      type: ["string", "null"],
      description: "The manufacturer's directions, verbatim from the pack. null when none is legible.",
    },
    label_readable: { type: "boolean" },
    read_note: {
      type: ["string", "null"],
      description:
        "Internal only, never shown to a member. Begin with \"Couldn't fully read the label —\" when the pack could not be resolved.",
    },
  },
  required: ["ingredients", "label_readable"],
  additionalProperties: false,
} as const;

interface LabelPayload {
  brand?: string | null;
  product_name?: string | null;
  ingredients?: unknown;
  category?: string | null;
  application_area?: string | null;
  leave_on?: boolean | null;
  usage_instructions?: string | null;
  label_readable?: boolean;
  read_note?: string | null;
}

function instructions(allowSearch: boolean): string {
  return `You are reading two photos of the same hair product and reporting EXACTLY what is printed on the pack. Photo 1 is the FRONT (brand + product name). Photo 2 is the BACK (ingredient panel + directions).

1. brand / product_name: read from photo 1. product_name must be what the brand actually calls the product, not descriptor text. NEVER invent and never expand an abbreviation you cannot see.

2. ingredients[] must be the COMPLETE INCI panel from photo 2, in printed order, one entry per ingredient, spelled character-for-character as printed. Do NOT translate to a common name, do NOT anglicise, do NOT reorder the parts of a name, do NOT merge two entries, do NOT split a slash-joined entry, and do NOT add an ingredient that is not printed — not even one products like this usually contain. Small print still counts: work along the panel and transcribe every entry. If no panel is legible at all, return [].

3. The back panel of a bottle curves, so part of the list may be distorted or run around the edge. Read what is legible and keep going; a partially curved panel is normal and is not a reason to give up.

4. category: a plain description of what it is. null if unclear. application_area: EXACTLY one of "scalp", "lengths_ends", "scalp_and_lengths", "rinse_out", "unknown", whichever the pack's own directions support. leave_on: true if it stays on the hair, false if it is rinsed out, null if not stated. usage_instructions: the directions as printed, verbatim and trimmed; null if none is legible.

5. label_readable: false only when you genuinely could not read the pack.

6. You are reporting a label. Add no advice, no verdict, no commentary, and no hair typing terminology (never "3C", "4C", "type 4" — this app says "Afro and textured hair").

${
    allowSearch
      ? `7. The first read could not resolve this product from the photos, so you may now use web_search to resolve the brand, product name and INCI list. Search queries like '[brand] [product name] ingredients' or '[brand] [product name] INCI'. Prefer the pack over the web wherever the pack is legible.`
      : `7. NO SEARCH TOOL IS AVAILABLE ON THIS CALL. Read the brand, product name, INCI list and directions from these two photos ONLY. Invent nothing: return what you can read, leave the rest empty or null, and set read_note to "Couldn't fully read the label —" plus what defeated you, so the pack can be resolved on a second pass.`
  }

Return your answer by invoking the return_product_label tool exactly once.`;
}

async function readLabel(args: {
  front: string;
  back: string;
  allowSearch: boolean;
  userId: string;
}): Promise<{ payload: LabelPayload; searches: number }> {
  const userContent: ContentBlockInput[] = [
    { type: "text", text: "Photo 1 — the FRONT of the pack:" },
    { type: "image", source: toAnthropicImageSource(args.front) },
    { type: "text", text: "Photo 2 — the BACK of the pack, with the ingredient panel:" },
    { type: "image", source: toAnthropicImageSource(args.back) },
  ];

  const decision = decidePhotoSearch(args.allowSearch ? 2 : 1, args.allowSearch);
  const webSearchTool: ServerTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: decision.maxUses,
  };

  const result = await callClaude<LabelPayload>({
    model: VISION_MODEL,
    systemBlocks: [{ type: "text", text: instructions(decision.enabled) }],
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: "return_product_label",
        description: "Report what is printed on the pack. Invoke exactly once.",
        input_schema: LABEL_SCHEMA as unknown as Record<string, unknown>,
      },
      ...(decision.enabled ? [webSearchTool] : []),
    ],
    // With a server tool attached Anthropic requires the model to stay free to
    // invoke it, so tool_choice is only forced on the searchless read.
    ...(decision.enabled ? {} : { toolChoice: { type: "tool" as const, name: "return_product_label" } }),
    // 8192, as on the working path: 2000 truncated long INCI panels and the
    // result arrived unusable.
    max_tokens: 8192,
    meta: { ...AI_METER_META, user_id: args.userId },
  });

  if (!result.toolInput) {
    throw new ClaudeError(502, "Claude returned no return_product_label tool_use block");
  }
  return { payload: result.toolInput, searches: result.server_tool_use_count ?? 0 };
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || /^(null|unknown|n\/a)$/i.test(t)) return null;
  return t.slice(0, max);
};

interface Body {
  photos?: { front?: string; back?: string };
}

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

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json(500, { error: "AI is not configured" });

  let payload: LabelPayload;
  let searches = 0;
  let searchRetryReason: string | null = null;
  try {
    const first = await readLabel({ front, back, allowSearch: false, userId: user.id });
    payload = first.payload;
    searches = first.searches;

    // CONDITIONAL SEARCH — unchanged from the working path. The pack is the
    // source of truth, so the read above had no search tool. One searching
    // pass is granted ONLY when the pack could not be resolved from the photos.
    const retry = needsSearchRetry({
      brand: payload.brand,
      product_name: payload.product_name,
      ingredients: payload.ingredients,
      ai_summary: payload.read_note ?? "",
    });
    if (retry.needed) {
      searchRetryReason = retry.reason;
      try {
        const second = await readLabel({ front, back, allowSearch: true, userId: user.id });
        const secondRetry = needsSearchRetry({
          brand: second.payload.brand,
          product_name: second.payload.product_name,
          ingredients: second.payload.ingredients,
          ai_summary: second.payload.read_note ?? "",
        });
        // Keep the better of the two reads — a searching pass must never make
        // the answer worse than the pack-only read.
        if (!secondRetry.needed || !Array.isArray(payload.ingredients) || (payload.ingredients as unknown[]).length === 0) {
          payload = second.payload;
        }
        searches += second.searches;
      } catch (e) {
        console.error("[product-label-read] search retry failed", e);
      }
    }
  } catch (e) {
    const status = e instanceof ClaudeError ? e.status : 502;
    console.error(`[product-label-read] read failed (${status})`, e);
    if (status === 429) return json(429, { error: "We're busy right now — try again in a moment." });
    if (status === 402 || status === 403) {
      return json(status, { error: "AI is unavailable on this account right now." });
    }
    return json(502, {
      error:
        "We couldn't read the ingredient panel on the back. Retake just the back photo — the front was fine.",
    });
  }

  const ingredients = Array.isArray(payload.ingredients)
    ? (payload.ingredients as unknown[])
      .map((i) => (typeof i === "string" ? i.trim() : ""))
      .filter((i) => i.length > 0 && i.length < 120)
      .slice(0, 200)
    : [];

  const out = {
    brand: str(payload.brand, 80),
    product_name: str(payload.product_name, 160),
    ingredients,
    category: str(payload.category, 60),
    application_area: str(payload.application_area, 80),
    leave_on: typeof payload.leave_on === "boolean" ? payload.leave_on : null,
    usage_instructions: str(payload.usage_instructions, 1200),
    label_readable: payload.label_readable !== false &&
      (!!str(payload.product_name, 160) || ingredients.length > 0),
    elapsed_ms: Date.now() - startedAt,
  };

  console.log(JSON.stringify({
    function: "product-label-read",
    event: "phase_a_complete",
    model: VISION_MODEL,
    elapsed_ms: out.elapsed_ms,
    ingredient_count: ingredients.length,
    has_identity: !!(out.brand || out.product_name),
    label_readable: out.label_readable,
    web_search_invocations: searches,
    search_retry_reason: searchRetryReason,
  }));

  return json(200, out);
});
