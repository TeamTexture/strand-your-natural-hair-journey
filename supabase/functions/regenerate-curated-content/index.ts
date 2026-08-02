// regenerate-curated-content — the ONLY way educational hair-care copy
// enters the consumer app.
//
// Static hair education can no longer be written by hand in the frontend.
// Every teaching surface reads from public.curated_content, and rows only
// get there through this function: retrieve real manuscript passages via
// pgvector, generate the copy strictly from those passages, and store the
// result as `draft` WITH the verbatim passages so Paige can check every
// line against her book before publishing.
//
// Actions (admin-only):
//   { action: "generate",  content_key }  -> writes/overwrites a draft
//   { action: "publish",   content_key }  -> draft -> published
//   { action: "unpublish", content_key }  -> published -> draft
//   { action: "list" }                    -> all rows (admin review screen)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { GROUNDING_INSTRUCTION } from "../_shared/grounding.ts";
import { renderPassageBlock, retrievePassages, type Passage } from "../_shared/rag.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const MODEL = "google/gemini-2.5-pro";
const MODEL_VERSION = "curated@v1-grounded";

interface KeySpec {
  /** What the retrieval query asks the manuscript for. */
  ragQuery: string;
  /** How many passages to retrieve (capped at 10 by retrievePassages). */
  ragK: number;
  /** Output contract handed to the model. */
  task: string;
}

/** Registry of every curated educational key in the consumer app. */
const KEYS: Record<string, KeySpec> = {
  "wash-day-steps": {
    ragQuery:
      "The wash day process from start to finish: pre-wash preparation, sectioning the hair, soaking and saturating with water, first cleanse of the scalp, second cleanse of the hair, conditioning, detangling, deep conditioning, rinsing, sealing moisture, and styling.",
    ragK: 10,
    task: `Produce the ordered wash day step sequence, chronologically from pre-wash preparation through to styling.

OUTPUT — JSON only:
{ "intro": string, "steps": [ { "headline": string, "body": string, "why": string } ], "dos": [string], "donts": [string] }

- intro: <= 25 words, optional, may be omitted.
- headline: <= 8 words, sentence case — names the step.
- body: <= 30 words, one instruction, plain imperative sentences.
- why: <= 15 words, the reason this step matters. Must be a claim the passages actually make.
- 6 to 13 steps, chronological, no duplicated ideas.
- dos / donts: up to 3 each, <= 6 words per line.`,
  },
  "trim-length-retention": {
    ragQuery:
      "Trimming afro hair and retaining length: how often to trim, checking the ends, why trimming does not speed up growth, growth happening at the scalp, split ends travelling up the strand, breakage versus growth, and gentle handling to keep length.",
    ragK: 10,
    task: `Produce the teaching content on trims and keeping length.

OUTPUT — JSON only:
{ "steps": [ { "headline": string, "body": string, "why": string } ], "dos": [string], "donts": [string] }

- headline: <= 12 words. body: <= 40 words. why: <= 15 words (omit when the passages give no reason).
- 3 to 6 items. dos / donts: up to 3 each, <= 6 words per line.`,
  },
  "wash-day-guidance": {
    ragQuery:
      "Wash day technique in order: soaking the hair with water first, sectioning, cleansing the scalp then the lengths, conditioning with gentle heat, detangling with slip, rinsing with cool water to close the cuticle, sealing with a leave-in, and styling damp hair gently.",
    ragK: 10,
    task: `Produce the ordered wash day guidance tips, in the order the wash day happens.

OUTPUT — JSON only:
{ "items": [ { "headline": string, "body": string, "why": string } ] }

- headline: <= 8 words. body: <= 30 words. why: <= 15 words.
- 4 to 7 items, chronological (prep, cleanse, condition, rinse and seal, style).`,
  },
  "wash-log-scalp-and-breakage": {
    ragQuery:
      "Scalp comfort and breakage in afro hair: what a healthy scalp feels like, itching, tightness, tenderness and build up, the difference between breakage and normal shedding, and what repeated breakage signals about a routine.",
    ragK: 10,
    task: `Produce short teaching notes that help a member describe her scalp comfort and breakage accurately.

OUTPUT — JSON only:
{ "items": [ { "headline": string, "body": string, "why": string } ] }

- headline: <= 8 words. body: <= 30 words. why: <= 15 words.
- 2 to 3 items.`,
  },
  "wash-log-hair-feel": {
    ragQuery:
      "How afro hair feels when it is moisturised versus dry or coated, judging moisture by movement and feel rather than labels, and why the ends of the hair show dryness and damage first.",
    ragK: 10,
    task: `Produce short teaching notes that help a member describe how her hair feels.

OUTPUT — JSON only:
{ "items": [ { "headline": string, "body": string, "why": string } ] }

- headline: <= 8 words. body: <= 30 words. why: <= 15 words.
- 2 to 3 items.`,
  },
  "wash-log-styling": {
    ragQuery:
      "Styling afro hair after a wash day: tension at the scalp, low manipulation, protecting the ends, how the chosen style affects moisture loss and how long results last, and stress and its effect on the scalp and hair.",
    ragK: 10,
    task: `Produce short teaching notes about styling choices after a wash day.

OUTPUT — JSON only:
{ "items": [ { "headline": string, "body": string, "why": string } ] }

- headline: <= 8 words. body: <= 30 words. why: <= 15 words.
- 2 to 4 items.`,
  },
};

const STRICT_GROUNDING = `HARD GROUNDING CONTRACT — THIS OVERRIDES EVERYTHING ELSE:
Every step, every instruction and every "why" line must come from the RETRIEVED MANUSCRIPT PASSAGES below. You may compress and rephrase the passages into plain, clear English. You may NOT add a claim, a mechanism, a benefit, a timing or a rule that the passages do not state. If the passages do not support a point, OMIT that point entirely — a shorter, fully supported list is correct; an invented line is a failure. Do not fill gaps from general hair-care knowledge. Do not name the book, chapters or page numbers.`;

async function generate(contentKey: string, spec: KeySpec) {
  const passages: Passage[] = await retrievePassages(spec.ragQuery, spec.ragK);
  if (passages.length === 0) {
    throw new Error(
      "no manuscript passages retrieved — refusing to generate ungrounded content",
    );
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const system = [
    STRAND_PERSONA_WITH_RULES,
    GROUNDING_INSTRUCTION,
    STRICT_GROUNDING,
    `TASK — ${spec.task}`,
    `RETRIEVED MANUSCRIPT PASSAGES:\n\n${passages.map(renderPassageBlock).join("\n\n---\n\n")}`,
  ].join("\n\n");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Generate the curated content for "${contentKey}". JSON only.`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ai gateway failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as Record<string, unknown>;
  } catch {
    throw new Error("model did not return valid JSON");
  }

  return {
    payload,
    // Verbatim passages, kept for line-by-line human verification.
    source_passages: passages.map((p) => ({
      body: p.body,
      chapter: p.chapter,
      chapter_title: p.chapter_title,
      section_heading: p.section_heading ?? null,
      page_start: p.page_start ?? null,
      page_end: p.page_end ?? null,
      similarity: p.similarity,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(401, { error: "missing auth" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Service-role callers (internal jobs) are trusted; everyone else must be
  // an admin. Ownership is always derived server-side from the token.
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  let isServiceRole = bearer === SERVICE_KEY;
  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: "unauthenticated" });
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (isAdmin !== true) return json(403, { error: "admin only" });
  }

  let body: { action?: string; content_key?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  const action = body.action ?? "generate";

  if (action === "list") {
    const { data, error } = await admin
      .from("curated_content")
      .select("id, content_key, payload, source_passages, model_version, manuscript_grounded, status, generated_at, published_at")
      .order("content_key");
    if (error) return json(500, { error: error.message });
    return json(200, { rows: data ?? [], keys: Object.keys(KEYS) });
  }

  const contentKey = body.content_key ?? "";
  if (!contentKey) return json(400, { error: "content_key required" });

  if (action === "publish" || action === "unpublish") {
    const publishing = action === "publish";
    const { data, error } = await admin
      .from("curated_content")
      .update({
        status: publishing ? "published" : "draft",
        published_at: publishing ? new Date().toISOString() : null,
      })
      .eq("content_key", contentKey)
      .select("content_key, status, published_at")
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!data) return json(404, { error: "content_key not found" });
    return json(200, data);
  }

  if (action !== "generate") return json(400, { error: "unknown action" });

  const spec = KEYS[contentKey];
  if (!spec) {
    return json(400, { error: `unknown content_key — known: ${Object.keys(KEYS).join(", ")}` });
  }

  try {
    const { payload, source_passages } = await generate(contentKey, spec);
    const { data, error } = await admin
      .from("curated_content")
      .upsert(
        {
          content_key: contentKey,
          payload,
          source_passages,
          model_version: MODEL_VERSION,
          manuscript_grounded: true,
          // Regeneration always lands as a draft — never auto-published.
          status: "draft",
          published_at: null,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "content_key" },
      )
      .select("content_key, status, model_version, generated_at")
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    return json(200, { ...data, passages: source_passages.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ fn: "regenerate-curated-content", contentKey, error: message }));
    return json(500, { error: message });
  }
});
