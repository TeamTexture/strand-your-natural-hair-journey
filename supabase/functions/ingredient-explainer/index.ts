// INGREDIENT EXPLAINER — the three cached layers behind the tappable
// ingredient sheet. NOTHING here is generated live per tap: every layer is
// read from cache and only generated when the cache misses.
//
//   LAYER 1  public.ingredients            global glossary, generated ONCE EVER
//                                          per ingredient, shared by all users
//   LAYER 2  public.product_ingredients    ingredient <-> product index, with
//                                          role_in_product generated once per
//                                          product
//   LAYER 3  ai_summaries `ingredient_fit:<inci_key>`
//                                          per-user fit, regenerated only when
//                                          the hair/health profile moves
//
// Modes:
//   mode: "sheet"  → resolve one ingredient for one product. Generates only the
//                    layers that are missing or stale, then returns cached rows.
//   mode: "index"  → batch: glossary + product index for a whole INCI list.
//                    Used at scan time and by the backfill.
//
// Grounding routes through buildClaudeRequest → persona + chapter whitelist +
// KB + RAG, and every response passes through sanitiseAndLog.

import { json, preflight } from "../_shared/cors.ts";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude } from "../_shared/anthropic-client.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
import { loadSensitivities, type LoadedSensitivities } from "../_shared/sensitivities.ts";
import { FLAGGED_INGREDIENTS_RULES } from "../_shared/flagged-ingredients.ts";
import {
  ANTI_SCAREMONGER_PHILOSOPHY,
  INGREDIENT_CATEGORIES,
  MOISTURE_LANGUAGE_RULE,
  NO_MEDICAL_RULE,
  NO_SOURCE_NAMING_RULE,
  clampWords,
  cleanDescriptiveCopy,
  cleanUsageTip,
  normaliseInciKey,
} from "../_shared/ingredient-copy.ts";
import {
  deterministicProfileFit,
  duplicatesFactualCopy,
  memberDataTokens,
  referencesMemberData,
} from "../_shared/fit-personalisation.ts";
import { checkContentIntegrity } from "../_shared/content-integrity.ts";

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const GLOSSARY_MODEL_VERSION = "claude-sonnet-4-6@glossary-v2-manuscript-2026-08-09";
const FIT_MODEL_VERSION = "claude-sonnet-4-6@fit-v2-manuscript-2026-08-09";
const MAX_BATCH = 40;

// Ingredients that get a glossary row but are never tokenised in prose.
//
// DELIBERATELY SHORT. This is an Afro-textured hair app: glycerin, denatured
// alcohol, tocopherol and the acid/preservative group are among the most
// discussed and most consequential ingredients our readers meet, so they MUST
// stay tappable. Only true formulation filler belongs here.
export const COMMON_KEYS = new Set([
  "water", "aqua", "aqua water", "water aqua", "eau",
  "parfum", "fragrance", "parfum fragrance", "fragrance parfum",
  "sodium chloride",
]);

/** Colour Index numbers ("CI 19140") are never worth explaining in prose. */
const isColourIndexKey = (key: string) => /^ci\s?\d{4,6}$/.test(key);
const isCommonKey = (key: string) => COMMON_KEYS.has(key) || isColourIndexKey(key);

// ── Glossary candidacy gate ─────────────────────────────────────────────
//
// A glossary row must be ONE real cosmetic ingredient. Compound labels
// ("Argan and Sweet Almond Oils") and descriptive phrases ("sulfate-free
// amphoteric surfactant system", "mild surfactant concentration") corrupt a
// table every user reads, so they never reach the generator and never get
// written. The client splits compound labels and looks the parts up
// individually instead.
const COMPOUND_MARKERS = /(\s+and\s+|\s*&\s*|\s*\/\s*|,)/i;
const DESCRIPTIVE_MARKERS =
  /\b(system|systems|concentration|concentrations|blend|blends|complex|free|based|profile|balance|content|level|levels|combination|matrix|formula|formulation|ratio|percentage|dose|dosage|absence|presence|lack)\b/i;

/** True when a label is worth looking up / generating as a single ingredient. */
export function isGlossaryCandidate(raw: string): boolean {
  const text = (raw ?? "").trim();
  if (text.length < 3) return false;
  if (COMPOUND_MARKERS.test(text)) return false;
  if (DESCRIPTIVE_MARKERS.test(text)) return false;
  // A real INCI name is short: five words is already generous.
  if (text.split(/\s+/).length > 5) return false;
  return true;
}

/** Rejects a generated entry whose own description admits non-recognition. */
export function isRecognisedDescription(what: string | null | undefined): boolean {
  const text = (what ?? "").trim();
  if (text.length < 8) return false;
  return !/\b(not a (?:real|recognised|known)|no(?:t)? (?:a )?recognised|unrecognised|unknown ingredient|does not appear to be|is not an ingredient|not an? (?:cosmetic )?ingredient|descriptive (?:phrase|term)|marketing (?:term|claim)|cannot identify|unable to identify)\b/i.test(text);
}



interface GlossaryRow {
  id: string;
  inci_key: string;
  display_name: string;
  phonetic: string | null;
  category: string | null;
  what_it_is: string | null;
  aliases: string[];
  is_common: boolean;
  /** molecule = one INCI entry, class = ingredient family, concept = hair-science idea. */
  kind?: "molecule" | "class" | "concept";
  class_category?: string | null;
  match_keywords?: string[] | null;
}

interface FitPayload {
  tone: "good" | "warn" | "bad";
  for_you: string;
  usage_tip: string;
  /** "product_analysis" = path 1 (authoritative), "profile" = generic tap. */
  _source?: "product_analysis" | "profile";
  _model_version?: string;
  _profile_fingerprint?: string;
  _generated_at?: string;
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── NAME INTEGRITY ──────────────────────────────────────────────────────
//
// A glossary row may carry a friendlier or fuller display name than the INCI
// key ("Curcuma Longa (Turmeric) Root Extract"). That is fine. What is NOT
// fine is upgrading a captured name to a DIFFERENT, more specific chemical —
// the glossary once displayed a generic "Alcohol" as "Alcohol Denat.", so a
// member read a denatured-alcohol explanation for a product whose label just
// said Alcohol. Rule: the captured name always wins unless the glossary name
// is the same substance with extra annotation (i.e. it contains the captured
// name).
export function safeDisplayName(captured: string, glossaryName: string): string {
  const raw = (captured ?? "").trim();
  if (!raw) return glossaryName;
  const a = normaliseInciKey(raw);
  const b = normaliseInciKey(glossaryName ?? "");
  if (!b || a === b) return glossaryName || raw;
  // Same substance, richer label (annotated botanicals) — keep the glossary's.
  if (b.includes(a)) return glossaryName;
  // Anything else is a rename to a different chemical: keep what was captured.
  return raw.replace(/\s+/g, " ");
}


// ── LAYER 1: glossary ───────────────────────────────────────────────────

const GLOSSARY_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      minItems: 0,

      items: {
        type: "object",
        properties: {
          input_name: { type: "string", description: "The ingredient name exactly as supplied to you, so the entry can be matched back." },
          display_name: { type: "string", description: "Properly cased INCI name, e.g. 'Amodimethicone', 'Cetearyl Alcohol'." },
          phonetic: { type: "string", description: "UK-English pronunciation guide with the stressed syllable in capitals and syllables hyphenated, e.g. 'am-oh-die-METH-ih-kohn', 'set-EER-il AL-kuh-hol'." },
          category: { type: "string", enum: [...INGREDIENT_CATEGORIES], description: "The single closest category from the framework." },
          what_it_is: { type: "string", description: "1-2 sentences, MAX 30 WORDS, layman's terms. Explain the mechanism in plain English — what the molecule physically does. No advice, no usage instructions, no reference to any particular user." },
          aliases: { type: "array", items: { type: "string" }, description: "Common INCI synonyms and trade names for this exact molecule so lookups resolve. Empty array if none." },
          is_common: { type: "boolean", description: "True ONLY for formulation filler with nothing to teach: water/aqua, parfum/fragrance, sodium chloride, and colourant index numbers (CI 19140). Everything else is false. Humectants (glycerin), alcohols (alcohol denat), antioxidants (tocopherol), acids and preservatives are NOT common — readers of a textured-hair app need those explained, so they must be false." },
        },
        required: ["input_name", "display_name", "phonetic", "category", "what_it_is", "aliases", "is_common"],
      },
    },
    skipped: {
      type: "array",
      items: {
        type: "object",
        properties: {
          input_name: { type: "string", description: "The supplied name you declined to write an entry for." },
          why: { type: "string", description: "Short reason: 'not an ingredient', 'descriptive phrase', 'multiple ingredients combined', 'unrecognised'." },
        },
        required: ["input_name", "why"],
      },
      description: "Names you did NOT write an entry for because they are not a single real cosmetic ingredient. Always return this array, empty if you wrote an entry for every name.",
    },
  },
  required: ["entries"],
} as Record<string, unknown>;


function glossaryInstructions(): string {
  return `You are writing entries for STRAND's shared ingredient glossary. These entries are read by EVERY user, so they are purely factual and contain NO personalisation, NO advice and NO usage instructions.

Return one entry per supplied ingredient name via the return_glossary tool.

${MOISTURE_LANGUAGE_RULE}

${ANTI_SCAREMONGER_PHILOSOPHY}
The glossary carries no tone at all — never describe an ingredient as bad, harmful, harsh, nasty or something to avoid. Describe what it does, neutrally.

RULES:
1. what_it_is: 1-2 sentences, MAX 30 words, plain English a reader with no chemistry knowledge understands. Lead with the mechanism ("a fatty alcohol that coats the cuticle so strands slide past each other"). Translate the chemistry — never leave a term like "cationic surfactant" unexplained.
2. phonetic: UK English, syllables hyphenated, the stressed syllable in CAPITALS.
3. category: exactly one value from the enum.
4. aliases: only true synonyms for the SAME molecule.
5. NEVER INVENT AN ENTRY. If a supplied name is not a single real cosmetic ingredient — it is a descriptive phrase ("sulfate-free amphoteric surfactant system", "mild surfactant concentration"), two or more ingredients combined into one label ("Argan and Sweet Almond Oils"), a marketing claim, or something you do not recognise — return NO entry for it. Put it in the skipped array with a short reason instead. This table is read by every user, so a wrong or invented row is worse than a missing one.
6. ${NO_SOURCE_NAMING_RULE}
7. ${NO_MEDICAL_RULE}`;

}

async function generateGlossary(names: string[]): Promise<Array<Record<string, unknown>>> {
  const req = await buildClaudeRequest({
    surface: "ingredient-explainer",
    function_kind: "ingredient-explainer",
    task_instructions: glossaryInstructions(),
    user_payload: { ingredients: names },
    force_topic_ids: ["porosity"],
    rag_query: `what these hair product ingredients do: ${names.slice(0, 12).join(", ")}`,
    rag_k: 3,
    tool: {
      name: "return_glossary",
      description: "Return one factual glossary entry per supplied name that IS a single real cosmetic ingredient, and list every other supplied name in skipped.",
      input_schema: GLOSSARY_SCHEMA,
    },
    toolChoice: { type: "tool", name: "return_glossary" },
    max_tokens: 2400,
  });
  const result = await callClaude<{
    entries: Array<Record<string, unknown>>;
    skipped?: Array<{ input_name?: string; why?: string }>;
  }>(req);
  const skipped = result.toolInput?.skipped ?? [];
  console.log(JSON.stringify({
    function: "ingredient-explainer",
    layer: "glossary",
    count: names.length,
    written: result.toolInput?.entries?.length ?? 0,
    skipped_count: skipped.length,
    // Names the model declined — these are the compound labels and descriptive
    // phrases we must never write into the shared table.
    skipped: skipped.slice(0, 40).map((s) => `${s?.input_name ?? "?"} (${s?.why ?? "?"})`),
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
  }));
  return result.toolInput?.entries ?? [];
}


/** Resolves glossary rows for a list of names, generating the misses in ONE
 *  batched call and caching them. Idempotent: an existing row is never
 *  regenerated. */
async function resolveGlossary(
  reader: SupabaseClient,
  names: string[],
): Promise<Map<string, GlossaryRow>> {
  const byKey = new Map<string, string>(); // key -> original name
  for (const raw of names) {
    const key = normaliseInciKey(raw);
    if (key && !byKey.has(key)) byKey.set(key, raw.trim());
  }
  const keys = [...byKey.keys()];
  const out = new Map<string, GlossaryRow>();
  if (keys.length === 0) return out;

  const { data: existing } = await reader
    .from("glossary_terms")
    .select("id, inci_key, display_name, phonetic, category, what_it_is, aliases, is_common, kind, class_category, match_keywords")
    .in("inci_key", keys);
  for (const row of (existing ?? []) as GlossaryRow[]) out.set(row.inci_key, row);

  // Alias resolution for anything still unmatched.
  const stillMissing = keys.filter((k) => !out.has(k));
  if (stillMissing.length > 0) {
    const { data: aliasRows } = await reader
      .from("glossary_terms")
      .select("id, inci_key, display_name, phonetic, category, what_it_is, aliases, is_common, kind, class_category, match_keywords")
      .overlaps("aliases", stillMissing.map((k) => byKey.get(k) ?? k));
    for (const row of (aliasRows ?? []) as GlossaryRow[]) {
      for (const alias of row.aliases ?? []) {
        const ak = normaliseInciKey(alias);
        if (stillMissing.includes(ak)) out.set(ak, row);
      }
    }
  }

  // Never send a compound label or a descriptive phrase to the generator: the
  // glossary is shared by every user, so one bad row is read by everyone.
  const generatable = keys.filter((k) => !out.has(k) && isGlossaryCandidate(byKey.get(k) ?? k));
  const toGenerate = generatable.slice(0, MAX_BATCH);
  if (toGenerate.length === 0) return out;

  const entries = await generateGlossary(toGenerate.map((k) => byKey.get(k) ?? k));
  const writer = serviceClient();
  const rows = entries.map((e) => {
    const inputName = String(e.input_name ?? e.display_name ?? "");
    const key = normaliseInciKey(inputName);
    const display = String(e.display_name ?? inputName).trim();
    const aliases = Array.isArray(e.aliases) ? (e.aliases as string[]).map((a) => String(a).trim()).filter(Boolean) : [];
    return {
      inci_key: key,
      display_name: display || inputName,
      phonetic: e.phonetic ? String(e.phonetic).trim() : null,
      category: e.category ? String(e.category) : null,
      what_it_is: clampWords(cleanDescriptiveCopy(String(e.what_it_is ?? "")), 32),
      aliases,
      is_common: Boolean(e.is_common) || isCommonKey(key),
      model_version: GLOSSARY_MODEL_VERSION,
    };
  }).filter((r) =>
    r.inci_key.length > 0 &&
    // Belt and braces: the model occasionally answers for a name it should
    // have skipped, and an unrecognised entry must never be persisted.
    isGlossaryCandidate(r.display_name) &&
    isGlossaryCandidate(r.inci_key) &&
    isRecognisedDescription(r.what_it_is)
  );


  if (rows.length > 0) {
    // Idempotent: unique on inci_key, so a concurrent generation is a no-op.
    await writer.from("glossary_terms").upsert(rows, { onConflict: "inci_key", ignoreDuplicates: false });
    const { data: fresh } = await reader
      .from("glossary_terms")
      .select("id, inci_key, display_name, phonetic, category, what_it_is, aliases, is_common, kind, class_category, match_keywords")
      .in("inci_key", rows.map((r) => r.inci_key));
    for (const row of (fresh ?? []) as GlossaryRow[]) out.set(row.inci_key, row);
  }
  return out;
}

// ── LAYER 1b: class + concept definitions ───────────────────────────────
//
// Seeded class terms ("humectants", "ceramides") and concept terms
// ("porosity", "cuticle") arrive with an empty what_it_is. The first time one
// is tapped we generate its factual definition ONCE and cache it on the row,
// exactly like a molecule entry.

const TERM_SCHEMA = {
  type: "object",
  properties: {
    what_it_is: { type: "string", description: "2-4 sentences, MAX 70 WORDS, layman's terms, split into paragraphs at the reasoning bridge. Explain the mechanism in plain English. No advice, no usage instructions, no reference to any particular user." },
    phonetic: { type: "string", description: "UK-English pronunciation guide with the stressed syllable in capitals, e.g. 'puh-ROSS-ih-tee'. Empty string if the term is everyday English." },
  },
  required: ["what_it_is", "phonetic"],
} as Record<string, unknown>;

async function generateTermDefinition(
  term: GlossaryRow,
): Promise<{ what_it_is: string; phonetic: string | null }> {
  const isConcept = term.kind === "concept";
  const req = await buildClaudeRequest({
    surface: "ingredient-explainer",
    function_kind: "ingredient-explainer",
    task_instructions: `You are writing ONE entry for STRAND's shared glossary. It is read by EVERY user, so it is purely factual: NO personalisation, NO advice, NO usage instructions.

Term: ${term.display_name}
Kind: ${isConcept ? "a hair-science CONCEPT (a property or structure of hair, not a product ingredient)" : "an ingredient CLASS (a family of ingredients that share a mechanism)"}

${MOISTURE_LANGUAGE_RULE}

${ANTI_SCAREMONGER_PHILOSOPHY}
The glossary carries no tone at all — never describe something as bad, harmful, harsh or something to avoid. Describe what it is and what it does, neutrally.

RULES:
1. what_it_is: MAX 70 words. ${isConcept
      ? "Explain what the property or structure IS, and what makes it vary between heads of hair — reasoning from the retrieved manuscript teaching."
      : "Explain what the family has in common mechanically, and name two or three examples of ingredients that belong to it."}
2. Plain English a reader with no chemistry knowledge understands. Translate every technical term you use.
3. phonetic: only where the word is genuinely hard to say; otherwise return an empty string.
4. ${NO_SOURCE_NAMING_RULE}
5. ${NO_MEDICAL_RULE}`,
    user_payload: { term: term.display_name, kind: term.kind, aliases: term.aliases ?? [] },
    force_topic_ids: ["porosity"],
    rag_query: `${term.display_name} — what it is and how it behaves in textured hair`,
    rag_k: 4,
    tool: {
      name: "return_term",
      description: "Return the factual glossary definition for this term.",
      input_schema: TERM_SCHEMA,
    },
    toolChoice: { type: "tool", name: "return_term" },
    max_tokens: 1024,
  });
  const result = await callClaude<{ what_it_is: string; phonetic: string }>(req);
  console.log(JSON.stringify({
    function: "ingredient-explainer",
    layer: "term-definition",
    term: term.display_name,
    kind: term.kind,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
  }));
  const raw = result.toolInput;
  return {
    what_it_is: clampWords(cleanDescriptiveCopy(String(raw?.what_it_is ?? "")), 75),
    phonetic: raw?.phonetic ? String(raw.phonetic).trim() || null : null,
  };
}

/** Fills in the definition for any seeded class/concept row that has none yet,
 *  caching it on the row so it is generated once ever. */
async function fillTermDefinition(entry: GlossaryRow): Promise<GlossaryRow> {
  if (entry.what_it_is && entry.what_it_is.trim().length > 0) return entry;
  if ((entry.kind ?? "molecule") === "molecule") return entry;
  const def = await generateTermDefinition(entry);
  if (!def.what_it_is) return entry;
  const writer = serviceClient();
  await writer
    .from("glossary_terms")
    .update({
      what_it_is: def.what_it_is,
      phonetic: def.phonetic ?? entry.phonetic,
      model_version: GLOSSARY_MODEL_VERSION,
    })
    .eq("id", entry.id);
  return { ...entry, what_it_is: def.what_it_is, phonetic: def.phonetic ?? entry.phonetic };
}

// ── LAYER 2: product index + role_in_product ────────────────────────────

const ROLES_SCHEMA = {
  type: "object",
  properties: {
    roles: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The ingredient name exactly as supplied." },
          role_in_product: { type: "string", description: "What this ingredient is doing in THIS specific product. ONE sentence, MAX 25 WORDS. Account for the product's category/purpose and the ingredient's position in the INCI list. No advice, no personalisation, no reference to any other product." },
        },
        required: ["name", "role_in_product"],
      },
    },
  },
  required: ["roles"],
} as Record<string, unknown>;

async function generateRoles(
  product: { name: string; brand: string; category: string | null },
  ingredients: string[],
): Promise<Map<string, string>> {
  const req = await buildClaudeRequest({
    surface: "ingredient-explainer",
    function_kind: "ingredient-explainer",
    task_instructions: `You are explaining what each ingredient is doing INSIDE one specific product. Return via the return_roles tool.

Product: ${product.brand ? `${product.brand} — ` : ""}${product.name}${product.category ? ` (${product.category})` : ""}

${MOISTURE_LANGUAGE_RULE}

${ANTI_SCAREMONGER_PHILOSOPHY}

RULES:
1. ONE sentence per ingredient, MAX 25 words, plain English.
2. It must be about THIS product's formula and purpose — a fatty alcohol in a cleanser plays a different role than in a conditioner. Use the ingredient's position in the supplied list as a signal of concentration.
3. Purely factual. No advice, no usage instructions, no tone, no personalisation, and never mention any OTHER product, category, brand or routine step.
4. ${NO_SOURCE_NAMING_RULE}
5. ${NO_MEDICAL_RULE}`,
    user_payload: { product, ingredients },
    force_topic_ids: ["porosity"],
    rag_query: `role of ingredients inside a ${product.category ?? "hair product"}: ${ingredients.slice(0, 12).join(", ")}`,
    rag_k: 3,
    tool: {
      name: "return_roles",
      description: "Return the role each ingredient plays in this product.",
      input_schema: ROLES_SCHEMA,
    },
    toolChoice: { type: "tool", name: "return_roles" },
    max_tokens: 2400,
  });
  const result = await callClaude<{ roles: Array<{ name: string; role_in_product: string }> }>(req);
  console.log(JSON.stringify({
    function: "ingredient-explainer",
    layer: "roles",
    count: ingredients.length,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
  }));
  const map = new Map<string, string>();
  for (const r of result.toolInput?.roles ?? []) {
    const key = normaliseInciKey(r?.name ?? "");
    if (!key) continue;
    map.set(key, clampWords(cleanDescriptiveCopy(String(r.role_in_product ?? "")), 26));
  }
  return map;
}

// ── LAYER 3: per-user fit ───────────────────────────────────────────────

const FIT_SCHEMA = {
  type: "object",
  properties: {
    tone: { type: "string", enum: ["good", "warn", "bad"] },
    for_you: { type: "string", description: "1-2 sentences, MAX 45 WORDS. Why this ingredient does or does not suit THIS user, tied to a real named data point from their profile (porosity, density, hair type, length, current style, a stated goal or challenge, or an entry in their avoid list). Never generic." },
    usage_tip: { type: "string", description: "ONE sentence, MAX 30 WORDS. How this user gets the most from this ingredient when it appears in a product they are using. Technique only. Must NOT reference, name, pair with, layer with or suggest ANY other product, product type, category, brand, accessory or routine step." },
  },
  required: ["tone", "for_you", "usage_tip"],
} as Record<string, unknown>;

async function generateFit(args: {
  ingredient: GlossaryRow;
  userPayload: Record<string, unknown>;
  rejectionRules?: string[];
}): Promise<FitPayload> {
  const { ingredient, userPayload, rejectionRules = [] } = args;
  const req = await buildClaudeRequest({
    surface: "ingredient-explainer",
    function_kind: "ingredient-explainer",
    task_instructions: `You are writing the personalised part of a glossary explainer sheet for ONE ${
      ingredient.kind === "concept"
        ? "hair-science concept"
        : ingredient.kind === "class"
        ? "ingredient class"
        : "ingredient"
    } and ONE user. Return via the return_fit tool.${
      ingredient.kind === "concept"
        ? "\n\nThis is a PROPERTY OF HER HAIR, not something in a bottle: explain what her own measured or logged values mean for how her hair behaves. Never talk about it as if it were an ingredient."
        : ingredient.kind === "class"
        ? "\n\nThis is a FAMILY of ingredients: reason about how the family as a whole behaves on her hair, not about one molecule."
        : ""
    }${rejectionRules.length > 0 ? `\n\nYour previous answer was rejected for these exact reasons:\n- ${rejectionRules.join("\n- ")}\nRewrite the relationship; do not repeat the rejected claim.` : ""}

Term: ${ingredient.display_name}${ingredient.category ? ` (${ingredient.category})` : ""}
What it is: ${ingredient.what_it_is ?? ""}

${MOISTURE_LANGUAGE_RULE}

${ANTI_SCAREMONGER_PHILOSOPHY}

${NON_PRESCRIPTIVE_RULES}

${FLAGGED_INGREDIENTS_RULES}

TONE — apply this exact decision tree:
- "bad" ONLY if AT LEAST ONE is true: (a) the ingredient or an alias matches one of the member's DECLARED TOPICAL SENSITIVITIES in context.topical_sensitivities (severity "avoid" or "limit") — never from ingredient frequency counts, (b) the user has a documented allergy / sensitivity / diagnosis this molecule directly aggravates, or (c) the molecule directly conflicts with a measurable hair trait they hold.
- "good" = a documented mechanism that benefits THIS user's measurable traits.
- "warn" = neutral / context-dependent / "fine for most people, watch how your scalp responds".

RULES:
1. for_you: MAX 45 words. It MUST name at least one real data point from the supplied profile (her porosity, density, curl pattern, elasticity, scalp condition, length, current style, a stated goal or challenge, or a declared sensitivity) and say what this term does ON THAT trait. It must NOT be a rephrase of "What it is" above it: do not restate what the ingredient generally does. Sentences like "a gentle plant-based surfactant that cleanses without stripping" are REJECTED — they describe the ingredient, not her hair. If the profile is too sparse to personalise honestly, reason from the traits she DOES have — never invent a trait.
2. usage_tip: MAX 30 words, technique only, about this ingredient in the products they already use. HARD BAN on referencing any other product, product type, category, brand, accessory or routine step, and on frequency caps or prohibitions.
3. ${NO_MEDICAL_RULE}
4. ${NO_SOURCE_NAMING_RULE}
5. NEVER say a product or ingredient seals, locks, traps or holds moisture IN. The author's position: it forms a barrier around the water already in the hair and slows evaporation. Sentences using sealing/locking/trapping language are removed wholesale, which leaves the member with nothing — so write the barrier/slower-evaporation wording first time.`,
    user_payload: userPayload,
    force_topic_ids: ["porosity", "scalp-conditions"],
    rag_query: `${ingredient.display_name} ${ingredient.category ?? ""} suitability for textured hair porosity density`,
    rag_k: 4,
    tool: {
      name: "return_fit",
      description: "Return the personalised fit for this ingredient and this user.",
      input_schema: FIT_SCHEMA,
    },
    toolChoice: { type: "tool", name: "return_fit" },
    max_tokens: 1024,
  });
  const result = await callClaude<FitPayload>(req);
  console.log(JSON.stringify({
    function: "ingredient-explainer",
    layer: "fit",
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
  }));
  const raw = result.toolInput;
  if (!raw) throw new Error("Claude returned no tool_use block");
  const tone: FitPayload["tone"] = raw.tone === "good" || raw.tone === "bad" ? raw.tone : "warn";
  return {
    tone,
    for_you: clampWords(cleanDescriptiveCopy(String(raw.for_you ?? "")), 48),
    usage_tip: clampWords(cleanUsageTip(String(raw.usage_tip ?? "")), 32),
  };
}

// ── Profile fingerprint ─────────────────────────────────────────────────

async function profileFingerprint(supabase: SupabaseClient, userId: string): Promise<{
  fingerprint: string;
  hair: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
}> {
  const [hairRes, healthRes, styleRes] = await Promise.all([
    supabase.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_style_profile")
      .select("chemical_history, current_colour_status, colour_type, colour_last_treated, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const hair = (hairRes.data ?? null) as Record<string, unknown> | null;
  const health = (healthRes.data ?? null) as Record<string, unknown> | null;
  const style = (styleRes.data ?? null) as Record<string, unknown> | null;
  const fingerprint = [
    (hair?.updated_at as string) ?? "none",
    (health?.updated_at as string) ?? "none",
    (style?.updated_at as string) ?? "none",
  ].join("|");
  return { fingerprint, hair, health, style };
}


// ── BACKFILL (admin only) ───────────────────────────────────────────────
//
// The glossary only fills as products are scanned, so a shelf that predates the
// explainer has no tokens at all. This mode walks every existing product,
// sourcing INCI names from BOTH `user_products.ingredients` AND the stored
// `ingredient_analysis:<key>` summaries (many products only ever had their INCI
// data written there), and runs each product through the SAME glossary + link
// path as index mode. Chunked: it processes `limit` products per call and
// returns a cursor so a caller can walk the shelf without timing out.

interface BackfillProduct {
  id: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  ingredients: string[] | null;
  product_key: string | null;
}

/** Ingredient names stored on the product row plus those inside its analysis. */
function namesForProduct(
  product: BackfillProduct,
  summaryNames: Map<string, string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return;
    const key = normaliseInciKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const n of product.ingredients ?? []) push(n);
  for (const n of summaryNames.get(product.id) ?? []) push(n);
  for (const n of product.product_key ? summaryNames.get(product.product_key) ?? [] : []) push(n);
  return out;
}

// ── Handler ─────────────────────────────────────────────────────────────

interface Body {
  mode?: "sheet" | "index" | "backfill";
  /** sheet mode */
  name?: string;
  userProductId?: string;
  /** index mode */
  ingredients?: string[];
  productName?: string;
  productBrand?: string;
  productCategory?: string | null;
  context?: Record<string, unknown>;
  force?: boolean;
  /** backfill mode */
  offset?: number;
  limit?: number;
  namesOnly?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;
    const body: Body = await req.json();
    const mode = body.mode ?? "sheet";

    // ── BACKFILL MODE: admin only, chunked ────────────────────────────
    if (mode === "backfill") {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) return json(403, { error: "admin only" });

      const writer = serviceClient();
      const offset = Math.max(0, Number(body.offset ?? 0) || 0);
      const limit = Math.min(5, Math.max(1, Number(body.limit ?? 2) || 2));

      const { data: productRows, error: prodErr } = await writer
        .from("user_products")
        .select("id, name, brand, category, ingredients, product_key")
        .order("created_at", { ascending: true });
      if (prodErr) return json(500, { error: prodErr.message });
      const products = (productRows ?? []) as unknown as BackfillProduct[];

      // INCI names hiding inside stored ingredient analyses.
      const { data: summaries } = await writer
        .from("ai_summaries")
        .select("kind, payload")
        .like("kind", "ingredient_analysis:%");
      const summaryNames = new Map<string, string[]>();
      for (const row of (summaries ?? []) as Array<{ kind: string; payload: unknown }>) {
        const productKey = String(row.kind).slice("ingredient_analysis:".length);
        const list = (row.payload as { ingredients?: unknown })?.ingredients;
        if (!Array.isArray(list)) continue;
        const names = list
          .map((i) => (i && typeof i === "object" ? (i as { name?: unknown }).name : null))
          .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
        const prev = summaryNames.get(productKey) ?? [];
        summaryNames.set(productKey, [...prev, ...names]);
      }

      const allNames = new Set<string>();
      for (const p of products) {
        for (const n of namesForProduct(p, summaryNames)) allNames.add(normaliseInciKey(n));
      }
      if (body.namesOnly) {
        return json(200, {
          products: products.length,
          distinct_names: allNames.size,
          candidates: [...allNames].filter((n) => isGlossaryCandidate(n)).length,
        });
      }

      const slice = products.slice(offset, offset + limit);
      const report: Array<Record<string, unknown>> = [];
      for (const product of slice) {
        const names = namesForProduct(product, summaryNames).filter((n) => isGlossaryCandidate(n));
        if (names.length === 0) {
          report.push({ product: product.name, names: 0, linked: 0 });
          continue;
        }
        try {
          const glossary = await resolveGlossary(writer, names.slice(0, MAX_BATCH));
          const links: Array<Record<string, unknown>> = [];
          const seen = new Set<string>();
          names.forEach((n, i) => {
            const g = glossary.get(normaliseInciKey(n));
            if (!g || seen.has(g.id)) return;
            seen.add(g.id);
            links.push({ user_product_id: product.id, ingredient_id: g.id, position: i });
          });
          if (links.length > 0) {
            await writer
              .from("product_ingredients")
              .upsert(links, { onConflict: "user_product_id,ingredient_id", ignoreDuplicates: true });
          }
          report.push({ product: product.name, names: names.length, resolved: glossary.size, linked: links.length });
        } catch (e) {
          report.push({ product: product.name, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const nextOffset = offset + slice.length;
      const [{ count: glossaryCount }, { count: linkCount }] = await Promise.all([
        writer.from("glossary_terms").select("id", { count: "exact", head: true }),
        writer.from("product_ingredients").select("user_product_id", { count: "exact", head: true }),
      ]);
      return json(200, {
        processed: slice.length,
        next_offset: nextOffset,
        done: nextOffset >= products.length,
        total_products: products.length,
        distinct_names: allNames.size,
        glossary_rows: glossaryCount ?? null,
        product_links: linkCount ?? null,
        report,
      });
    }



    // ── INDEX MODE: batch glossary + product index ────────────────────
    if (mode === "index") {
      const names = (body.ingredients ?? []).filter((n) => typeof n === "string" && n.trim().length > 0);
      if (!body.userProductId || names.length === 0) {
        return json(400, { error: "userProductId and ingredients are required" });
      }
      const { data: product } = await supabase
        .from("user_products")
        .select("id, name, brand, category, ingredients")
        .eq("id", body.userProductId)
        .maybeSingle();
      if (!product) return json(404, { error: "product not found" });

      const glossary = await resolveGlossary(supabase, names);

      // Only generate roles for links that don't exist yet.
      const ids = [...glossary.values()].map((g) => g.id);
      const { data: existingLinks } = await supabase
        .from("product_ingredients")
        .select("ingredient_id, role_in_product")
        .eq("user_product_id", product.id);
      const haveRole = new Set(
        (existingLinks ?? [])
          .filter((l) => l.role_in_product && String(l.role_in_product).trim().length > 0)
          .map((l) => l.ingredient_id as string),
      );
      const needRoles = names.filter((n) => {
        const g = glossary.get(normaliseInciKey(n));
        return g && !haveRole.has(g.id);
      });

      let roles = new Map<string, string>();
      if (needRoles.length > 0) {
        roles = await generateRoles(
          {
            name: body.productName ?? String(product.name ?? ""),
            brand: body.productBrand ?? String(product.brand ?? ""),
            category: body.productCategory ?? (product.category as string | null) ?? null,
          },
          needRoles.slice(0, MAX_BATCH),
        );
      }

      const links = names.map((n, i) => {
        const g = glossary.get(normaliseInciKey(n));
        if (!g) return null;
        const role = roles.get(normaliseInciKey(n));
        return {
          user_product_id: product.id,
          ingredient_id: g.id,
          position: i,
          ...(role ? { role_in_product: role } : {}),
        };
      }).filter(Boolean) as Array<Record<string, unknown>>;

      // Dedupe on ingredient_id — an INCI list can repeat a molecule.
      const seen = new Set<string>();
      const deduped = links.filter((l) => {
        const id = String(l.ingredient_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      if (deduped.length > 0) {
        await supabase
          .from("product_ingredients")
          .upsert(deduped, { onConflict: "user_product_id,ingredient_id" });
      }
      return json(200, {
        indexed: deduped.length,
        glossary_rows: ids.length,
        roles_generated: roles.size,
      });
    }

    // ── SHEET MODE: one ingredient, one product ───────────────────────
    const rawName = (body.name ?? "").trim();
    if (!rawName) return json(400, { error: "name is required" });
    const key = normaliseInciKey(rawName);

    // RELIABILITY: a tap must ALWAYS render something. Glossary resolution,
    // definition fill, role and fit are each allowed to fail independently —
    // one model hiccup, cap or timeout must never turn the whole sheet into
    // "we couldn't load this ingredient just now".
    let glossary = new Map<string, GlossaryRow>();
    try {
      glossary = await resolveGlossary(supabase, [rawName]);
    } catch (e) {
      console.log(JSON.stringify({
        function: "ingredient-explainer",
        layer: "glossary",
        soft_error: e instanceof Error ? e.message : String(e),
        name: rawName,
      }));
    }
    let entry = glossary.get(key);
    // A compound label or descriptive phrase resolves to nothing by design, and
    // a generation failure must not look different to the member: serve the
    // captured name with an honest "no verified entry yet" note.
    if (!entry) {
      return json(200, {
        glossary: {
          id: "",
          inci_key: key,
          display_name: rawName.replace(/\s+/g, " "),
          phonetic: null,
          category: null,
          what_it_is: null,
          aliases: [],
          is_common: false,
          kind: "molecule" as const,
        },
        kind: "molecule",
        role_in_product: null,
        product_category: body.productCategory ?? null,
        fit: null,
        fit_note: null,
        unresolved: true,
      });
    }

    // Seeded class/concept rows carry no definition until first tapped.
    try {
      entry = await fillTermDefinition(entry);
    } catch (e) {
      console.log(JSON.stringify({
        function: "ingredient-explainer",
        layer: "term-definition",
        soft_error: e instanceof Error ? e.message : String(e),
        name: rawName,
      }));
    }
    const kind = entry.kind ?? "molecule";

    // SPEED: layer 2 (role in this product) and layer 3 (per-user fit) are
    // independent of one another — the fit reasons about the ingredient, not
    // about its role in the formula. They used to run back to back, which made
    // a cold sheet two sequential model calls. They now run together, so a cold
    // sheet costs the slower of the two rather than the sum.
    const term = entry;
    // The name the member sees and the model reasons about is the one that was
    // actually captured off the pack — never a more specific chemical.
    const displayName = safeDisplayName(rawName, term.display_name);

    // Layer 2 — role in THIS product (cached on the link row). Only a molecule
    // has a role inside a formula: a class or a concept does not.
    const resolveRole = async (): Promise<{ role: string | null; category: string | null }> => {
      let roleInProduct: string | null = null;
      let productCategory: string | null = body.productCategory ?? null;
      if (kind !== "molecule" || !body.userProductId) return { role: null, category: productCategory };
      const { data: product } = await supabase
        .from("user_products")
        .select("id, name, brand, category, ingredients")
        .eq("id", body.userProductId)
        .maybeSingle();
      if (!product) return { role: null, category: productCategory };
      productCategory = productCategory ?? ((product.category as string | null) ?? null);
      const { data: link } = await supabase
        .from("product_ingredients")
        .select("role_in_product")
        .eq("user_product_id", product.id)
        .eq("ingredient_id", term.id)
        .maybeSingle();
      roleInProduct = (link?.role_in_product as string | null) ?? null;
      if (!roleInProduct) {
        const roles = await generateRoles(
          {
            name: String(product.name ?? ""),
            brand: String(product.brand ?? ""),
            category: productCategory,
          },
          [displayName],
        );
        roleInProduct = roles.get(normaliseInciKey(displayName)) ?? roles.get(key) ?? null;
        await supabase.from("product_ingredients").upsert(
          {
            user_product_id: product.id,
            ingredient_id: term.id,
            position: Array.isArray(product.ingredients)
              ? (product.ingredients as string[]).findIndex((i) => normaliseInciKey(i) === key)
              : null,
            role_in_product: roleInProduct,
          },
          { onConflict: "user_product_id,ingredient_id" },
        );
      }
      return { role: roleInProduct, category: productCategory };
    };

    // Layer 3 — "Works with your hair".
    //
    // SINGLE SOURCE OF TRUTH: when the sheet is opened from a saved product,
    // this line comes from the product-specific ingredient-analysis already
    // stored for that product (path 1 — sensitivity-aware, exposure-aware,
    // aware of where the ingredient sits in the list). It is NEVER regenerated
    // here, so the sheet can no longer contradict the verdict card that sits
    // above it. If the product analysis did not single this ingredient out, the
    // sheet says so plainly rather than inventing a verdict.
    const cacheKind = `ingredient_fit:${term.inci_key}`;

    const resolveProductFit = async (): Promise<{ fit: FitPayload | null; note: string | null }> => {
      if (!body.userProductId) return { fit: null, note: null };
      const { data: product } = await supabase
        .from("user_products")
        .select("product_key")
        .eq("id", body.userProductId)
        .maybeSingle();
      const productKey = (product?.product_key as string | null) ?? null;
      if (!productKey) return { fit: null, note: null };

      const { data: rows } = await supabase
        .from("ai_summaries")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .like("kind", `ingredient_analysis:${productKey}:%`)
        .order("updated_at", { ascending: false })
        .limit(1);
      const payload = (rows?.[0]?.payload ?? null) as
        | { ingredients?: { name?: string; tone?: string; body?: string }[] }
        | null;
      if (!payload || !Array.isArray(payload.ingredients)) return { fit: null, note: null };

      const match = payload.ingredients.find(
        (i) => i && typeof i.name === "string" && normaliseInciKey(i.name) === key,
      );
      if (!match || typeof match.body !== "string" || match.body.trim().length < 8) {
        return { fit: null, note: "not_flagged" };
      }
      const tone: FitPayload["tone"] =
        match.tone === "good" || match.tone === "bad" ? match.tone : "warn";
      return {
        fit: {
          tone,
          for_you: clampWords(cleanDescriptiveCopy(match.body), 60),
          usage_tip: "",
          _source: "product_analysis",
        },
        note: null,
      };
    };

    // Product-agnostic tap (avoid list, ingredient research): there is no
    // product to be authoritative, so a profile-level line is generated and
    // cached. Never used when a product analysis exists.
    const resolveProfileFit = async (): Promise<FitPayload> => {
      const { fingerprint, hair, health, style } = await profileFingerprint(supabase, user.id);
      const fitIntegrity = (payload: FitPayload) => checkContentIntegrity({
        functionName: "ingredient-explainer",
        surface: "ingredient-explainer-fit",
        userId: user.id,
        subject: term.inci_key,
        fields: [{ field: "fit.for_you", text: payload.for_you }],
      });

      if (!body.force) {
        const { data: cached } = await supabase
          .from("ai_summaries")
          .select("payload")
          .eq("user_id", user.id)
          .eq("kind", cacheKind)
          .maybeSingle();
        const payload = cached?.payload as FitPayload | undefined;
        if (
          payload &&
          payload._model_version === FIT_MODEL_VERSION &&
          payload._profile_fingerprint === fingerprint &&
          payload.for_you?.trim() &&
          fitIntegrity(payload).ok
        ) {
          return payload;
        }
      }

      // Declared topical sensitivities — the ONLY ingredient list that may make
      // an ingredient "bad" for her. Frequency of ownership never can.
      const [goalRes, sens] = await Promise.all([
        supabase.from("user_goals")
          .select("kind, title, target_text, challenges, challenge, status")
          .eq("user_id", user.id).neq("status", "complete"),
        loadSensitivities(supabase, user.id, "topical") as Promise<LoadedSensitivities>,
      ]);

      const topicalSensitivities = sens.all.map((e) => ({
        name: e.name,
        severity: e.severity,
      }));
      const args = {
        ingredient: term,
        userPayload: {
          ingredient: {
            name: displayName,
            category: term.category,
            what_it_is: term.what_it_is,
          },
          hairProfile: hair ?? {},
          healthProfile: health ?? {},
          goals: goalRes.data ?? [],
          context: {
            ...(body.context ?? {}),
            topical_sensitivities: topicalSensitivities.slice(0, 40),
          },
        },
      };
      // The explanation IS the answer: a blank `for_you` is a failed generation,
      // never something to cache and serve. Ask once more, then give up rather
      // than persist an empty personalised line.
      let generated = await generateFit(args);
      let integrity = fitIntegrity(generated);
      if (!generated.for_you.trim() || !integrity.ok) {
        generated = await generateFit({
          ...args,
          rejectionRules: generated.for_you.trim()
            ? integrity.problems
            : ["The personalised explanation was empty."],
        });
        integrity = fitIntegrity(generated);
      }
      if (!generated.for_you.trim() || !integrity.ok) {
        generated = {
          tone: "warn",
          for_you: deterministicProfileFit({
            hair,
            goals: (goalRes.data ?? []) as Array<Record<string, unknown>>,
            ingredientCategory: term.category,
          }),
          usage_tip: "",
        };
      }
      generated._model_version = FIT_MODEL_VERSION;
      generated._profile_fingerprint = fingerprint;
      generated._generated_at = new Date().toISOString();
      generated._source = "profile";


      const { data: prior } = await supabase
        .from("ai_summaries")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (prior?.id) {
        await supabase.from("ai_summaries")
          .update({ payload: generated as unknown as object, updated_at: new Date().toISOString() })
          .eq("id", prior.id);
      } else {
        await supabase.from("ai_summaries")
          .insert({ user_id: user.id, kind: cacheKind, payload: generated as unknown as object });
      }
      return generated;
    };

    // NO BOILERPLATE. "Not flagged in this product's analysis" is a fact about
    // the analysis, never an answer to "what does this mean for MY hair".
    //
    //  - A CONCEPT or a CLASS (cuticle, porosity, surfactants, protein) is a
    //    property of her hair or a family of ingredients — a product analysis
    //    never scores it, so it always resolves against her stored profile.
    //  - A MOLECULE the product analysis DID single out keeps that verdict (it
    //    is the authoritative, product-specific line).
    //  - A MOLECULE the analysis did not single out falls back to the cached
    //    profile-level line, so she still gets something specific to her hair
    //    rather than a non-answer. The note travels with it so the UI can frame
    //    it as general-to-her rather than a verdict on this formula.
    //  - A MOLECULE the product analysis singled out keeps that verdict ONLY
    //    when the line genuinely reasons about her record. A purely descriptive
    //    analysis sentence (a rephrase of "what it is") is NOT an answer to
    //    "what does this mean for MY hair", so the profile-grounded line is
    //    generated instead and the analysis TONE is preserved so the sheet can
    //    still never contradict the verdict card above it.
    const resolveFit = async (): Promise<{ fit: FitPayload | null; note: string | null }> => {
      if (body.userProductId && kind === "molecule") {
        const product = await resolveProductFit();
        if (product.fit) {
          const { hair, health } = await profileFingerprint(supabase, user.id);
          const [goalRes, sens] = await Promise.all([
            supabase.from("user_goals")
              .select("title, target_text, challenges, challenge, status")
              .eq("user_id", user.id).neq("status", "complete"),
            loadSensitivities(supabase, user.id, "topical") as Promise<LoadedSensitivities>,
          ]);
          const tokens = memberDataTokens({
            hair,
            health,
            goals: goalRes.data ?? [],
            sensitivities: sens.all.map((e) => ({ name: e.name })),
          });
          const line = product.fit.for_you;
          const personalised = referencesMemberData(line, tokens) &&
            !duplicatesFactualCopy(line, entry.what_it_is);
          if (personalised) return product;
          console.log(JSON.stringify({
            function: "ingredient-explainer",
            layer: "fit",
            event: "product_line_not_personalised",
            term: entry.inci_key,
          }));
          try {
            const profile = await resolveProfileFit();
            return {
              fit: { ...profile, tone: product.fit.tone, _source: "product_analysis" },
              note: null,
            };
          } catch {
            return product;
          }
        }
        return { fit: await resolveProfileFit(), note: product.note };
      }
      return { fit: await resolveProfileFit(), note: null };
    };


    const [roleResult, fitResult] = await Promise.all([
      resolveRole().catch((e) => {
        console.log(JSON.stringify({
          function: "ingredient-explainer",
          layer: "role",
          soft_error: e instanceof Error ? e.message : String(e),
        }));
        return { role: null, category: body.productCategory ?? null };
      }),
      resolveFit().catch((e) => {
        console.log(JSON.stringify({
          function: "ingredient-explainer",
          layer: "fit",
          soft_error: e instanceof Error ? e.message : String(e),
        }));
        return { fit: null, note: null };
      }),
    ]);
    const roleInProduct = roleResult.role;
    const productCategory = roleResult.category;


    const buildResponse = (fit: FitPayload | null, note: string | null) => ({
      glossary: { ...entry, display_name: displayName },
      kind,
      role_in_product: roleInProduct,
      product_category: productCategory,
      fit,
      fit_note: note,
    });

    type SheetResponse = ReturnType<typeof buildResponse>;
    let sanitised = await sanitiseAndLog(
      buildResponse(fitResult.fit, fitResult.note),
      "ingredient-explainer",
    ) as SheetResponse;

    // A guardrail can legitimately strip the ONLY sentence in the personalised
    // line (e.g. the author's rejection of "locks moisture in"), which would
    // leave the member with an empty block. When that happens, regenerate once
    // — the prompt is told the rule — and re-run the guardrails on the result.
    const blank = (f: FitPayload | null | undefined) => !((f?.for_you ?? "").trim());
    if (!blank(fitResult.fit) && blank(sanitised.fit)) {
      console.log(JSON.stringify({
        function: "ingredient-explainer",
        layer: "fit",
        event: "regenerate_after_guardrail_stripped_for_you",
        term: entry.inci_key,
      }));
      body.force = true;
      try {
        const fresh = await resolveProfileFit();
        sanitised = await sanitiseAndLog(
          buildResponse(fresh, fitResult.note),
          "ingredient-explainer",
        ) as SheetResponse;
      } catch { /* deterministic fallback below still prevents a hollow block */ }
    }
    if (blank(sanitised.fit)) {
      const { hair } = await profileFingerprint(supabase, user.id);
      const { data: goals } = await supabase.from("user_goals")
        .select("title, target_text, status")
        .eq("user_id", user.id).neq("status", "complete");
      const fallback: FitPayload = {
        tone: "warn",
        for_you: deterministicProfileFit({
          hair,
          goals: (goals ?? []) as Array<Record<string, unknown>>,
          ingredientCategory: entry.category,
        }),
        usage_tip: "",
        _source: "profile",
      };
      sanitised = await sanitiseAndLog(
        buildResponse(fallback, fitResult.note),
        "ingredient-explainer",
      ) as SheetResponse;
    }
    // Never serve a hollow block — the client renders its own honest line.
    if (blank(sanitised.fit)) sanitised = { ...sanitised, fit: null };
    return json(200, sanitised);
  } catch (e) {
    return aiErrorResponse(e, "ingredient-explainer");
  }
});
