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
import { requireAuthedUser } from "../_shared/auth.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { buildClaudeRequest } from "../_shared/build-prompt.ts";
import { callClaude } from "../_shared/anthropic-client.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
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
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const GLOSSARY_MODEL_VERSION = "claude-sonnet-4-6@glossary-v1";
const FIT_MODEL_VERSION = "claude-sonnet-4-6@fit-v1";
const MAX_BATCH = 40;

// Ingredients that get a glossary row but are never tokenised in prose.
const COMMON_KEYS = new Set([
  "water", "aqua", "aqua water", "water aqua", "eau",
  "parfum", "fragrance", "parfum fragrance", "fragrance parfum",
  "sodium chloride", "citric acid", "sodium hydroxide",
  "alcohol denat", "denatured alcohol", "ci 19140", "ci 42090",
  "sodium benzoate", "potassium sorbate", "tocopherol",
  "glycerin", "glycerine",
]);

interface GlossaryRow {
  id: string;
  inci_key: string;
  display_name: string;
  phonetic: string | null;
  category: string | null;
  what_it_is: string | null;
  aliases: string[];
  is_common: boolean;
}

interface FitPayload {
  tone: "good" | "warn" | "bad";
  for_you: string;
  usage_tip: string;
  _model_version?: string;
  _profile_fingerprint?: string;
  _generated_at?: string;
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── LAYER 1: glossary ───────────────────────────────────────────────────

const GLOSSARY_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          input_name: { type: "string", description: "The ingredient name exactly as supplied to you, so the entry can be matched back." },
          display_name: { type: "string", description: "Properly cased INCI name, e.g. 'Amodimethicone', 'Cetearyl Alcohol'." },
          phonetic: { type: "string", description: "UK-English pronunciation guide with the stressed syllable in capitals and syllables hyphenated, e.g. 'am-oh-die-METH-ih-kohn', 'set-EER-il AL-kuh-hol'." },
          category: { type: "string", enum: [...INGREDIENT_CATEGORIES], description: "The single closest category from the framework." },
          what_it_is: { type: "string", description: "1-2 sentences, MAX 30 WORDS, layman's terms. Explain the mechanism in plain English — what the molecule physically does. No advice, no usage instructions, no reference to any particular user." },
          aliases: { type: "array", items: { type: "string" }, description: "Common INCI synonyms and trade names for this exact molecule so lookups resolve. Empty array if none." },
          is_common: { type: "boolean", description: "True only for ubiquitous filler/base ingredients a reader does not need explained in prose: water/aqua, parfum/fragrance, sodium chloride, citric acid, pH adjusters, colourant index numbers." },
        },
        required: ["input_name", "display_name", "phonetic", "category", "what_it_is", "aliases", "is_common"],
      },
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
5. If a supplied name is not a real cosmetic ingredient, still return an entry using the name as given, category "Solvent" and a short honest what_it_is.
6. ${NO_SOURCE_NAMING_RULE}
7. ${NO_MEDICAL_RULE}`;
}

async function generateGlossary(names: string[]): Promise<Array<Record<string, unknown>>> {
  const req = await buildClaudeRequest({
    function_kind: "ingredient-explainer",
    task_instructions: glossaryInstructions(),
    user_payload: { ingredients: names },
    force_topic_ids: ["porosity"],
    rag_query: `what these hair product ingredients do: ${names.slice(0, 12).join(", ")}`,
    rag_k: 3,
    tool: {
      name: "return_glossary",
      description: "Return one factual glossary entry per supplied ingredient.",
      input_schema: GLOSSARY_SCHEMA,
    },
    toolChoice: { type: "tool", name: "return_glossary" },
    max_tokens: 4096,
  });
  const result = await callClaude<{ entries: Array<Record<string, unknown>> }>(req);
  console.log(JSON.stringify({
    function: "ingredient-explainer",
    layer: "glossary",
    count: names.length,
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
    .from("ingredients")
    .select("id, inci_key, display_name, phonetic, category, what_it_is, aliases, is_common")
    .in("inci_key", keys);
  for (const row of (existing ?? []) as GlossaryRow[]) out.set(row.inci_key, row);

  // Alias resolution for anything still unmatched.
  const stillMissing = keys.filter((k) => !out.has(k));
  if (stillMissing.length > 0) {
    const { data: aliasRows } = await reader
      .from("ingredients")
      .select("id, inci_key, display_name, phonetic, category, what_it_is, aliases, is_common")
      .overlaps("aliases", stillMissing.map((k) => byKey.get(k) ?? k));
    for (const row of (aliasRows ?? []) as GlossaryRow[]) {
      for (const alias of row.aliases ?? []) {
        const ak = normaliseInciKey(alias);
        if (stillMissing.includes(ak)) out.set(ak, row);
      }
    }
  }

  const toGenerate = keys.filter((k) => !out.has(k)).slice(0, MAX_BATCH);
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
      is_common: Boolean(e.is_common) || COMMON_KEYS.has(key),
      model_version: GLOSSARY_MODEL_VERSION,
    };
  }).filter((r) => r.inci_key.length > 0);

  if (rows.length > 0) {
    // Idempotent: unique on inci_key, so a concurrent generation is a no-op.
    await writer.from("ingredients").upsert(rows, { onConflict: "inci_key", ignoreDuplicates: false });
    const { data: fresh } = await reader
      .from("ingredients")
      .select("id, inci_key, display_name, phonetic, category, what_it_is, aliases, is_common")
      .in("inci_key", rows.map((r) => r.inci_key));
    for (const row of (fresh ?? []) as GlossaryRow[]) out.set(row.inci_key, row);
  }
  return out;
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
    max_tokens: 4096,
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
}): Promise<FitPayload> {
  const { ingredient, userPayload } = args;
  const req = await buildClaudeRequest({
    function_kind: "ingredient-explainer",
    task_instructions: `You are writing the personalised part of an ingredient explainer sheet for ONE ingredient and ONE user. Return via the return_fit tool.

Ingredient: ${ingredient.display_name}${ingredient.category ? ` (${ingredient.category})` : ""}
What it is: ${ingredient.what_it_is ?? ""}

${MOISTURE_LANGUAGE_RULE}

${ANTI_SCAREMONGER_PHILOSOPHY}

${NON_PRESCRIPTIVE_RULES}

TONE — apply this exact decision tree:
- "bad" ONLY if AT LEAST ONE is true: (a) the ingredient or an alias appears in context.avoid_ingredients, (b) the user has a documented allergy / sensitivity / diagnosis this molecule directly aggravates, or (c) the molecule directly conflicts with a measurable hair trait they hold.
- "good" = a documented mechanism that benefits THIS user's measurable traits.
- "warn" = neutral / context-dependent / "fine for most people, watch how your scalp responds".

RULES:
1. for_you: MAX 45 words, and it MUST name a real data point from the supplied profile. If the profile is too sparse to personalise honestly, say what the ingredient suits in terms of the traits they DO have — never invent a trait.
2. usage_tip: MAX 30 words, technique only, about this ingredient in the products they already use. HARD BAN on referencing any other product, product type, category, brand, accessory or routine step, and on frequency caps or prohibitions.
3. ${NO_MEDICAL_RULE}
4. ${NO_SOURCE_NAMING_RULE}`,
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
}> {
  const [hairRes, healthRes] = await Promise.all([
    supabase.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const hair = (hairRes.data ?? null) as Record<string, unknown> | null;
  const health = (healthRes.data ?? null) as Record<string, unknown> | null;
  const fingerprint = [
    (hair?.updated_at as string) ?? "none",
    (health?.updated_at as string) ?? "none",
  ].join("|");
  return { fingerprint, hair, health };
}

// ── Handler ─────────────────────────────────────────────────────────────

interface Body {
  mode?: "sheet" | "index";
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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;
    const body: Body = await req.json();
    const mode = body.mode ?? "sheet";

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

    const glossary = await resolveGlossary(supabase, [rawName]);
    const entry = glossary.get(key);
    if (!entry) return json(404, { error: "ingredient could not be resolved" });

    // Layer 2 — role in THIS product (cached on the link row).
    let roleInProduct: string | null = null;
    let productCategory: string | null = body.productCategory ?? null;
    if (body.userProductId) {
      const { data: product } = await supabase
        .from("user_products")
        .select("id, name, brand, category, ingredients")
        .eq("id", body.userProductId)
        .maybeSingle();
      if (product) {
        productCategory = productCategory ?? ((product.category as string | null) ?? null);
        const { data: link } = await supabase
          .from("product_ingredients")
          .select("role_in_product")
          .eq("user_product_id", product.id)
          .eq("ingredient_id", entry.id)
          .maybeSingle();
        roleInProduct = (link?.role_in_product as string | null) ?? null;
        if (!roleInProduct) {
          const roles = await generateRoles(
            {
              name: String(product.name ?? ""),
              brand: String(product.brand ?? ""),
              category: productCategory,
            },
            [entry.display_name],
          );
          roleInProduct = roles.get(normaliseInciKey(entry.display_name)) ?? roles.get(key) ?? null;
          await supabase.from("product_ingredients").upsert(
            {
              user_product_id: product.id,
              ingredient_id: entry.id,
              position: Array.isArray(product.ingredients)
                ? (product.ingredients as string[]).findIndex((i) => normaliseInciKey(i) === key)
                : null,
              role_in_product: roleInProduct,
            },
            { onConflict: "user_product_id,ingredient_id" },
          );
        }
      }
    }

    // Layer 3 — per-user fit, cached in ai_summaries, invalidated by profile.
    const cacheKind = `ingredient_fit:${entry.inci_key}`;
    const { fingerprint, hair, health } = await profileFingerprint(supabase, user.id);
    let fit: FitPayload | null = null;
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
        payload._profile_fingerprint === fingerprint
      ) {
        fit = payload;
      }
    }

    if (!fit) {
      const [goalRes, avoidRes] = await Promise.all([
        supabase.from("user_goals")
          .select("kind, title, target_text, challenge, status")
          .eq("user_id", user.id).neq("status", "complete"),
        supabase.from("user_products")
          .select("name, brand, rating, ingredients")
          .eq("user_id", user.id).lte("rating", 2).not("rating", "is", null),
      ]);
      const avoidIngredients = new Set<string>();
      for (const p of avoidRes.data ?? []) {
        for (const i of (p.ingredients as string[] | null) ?? []) avoidIngredients.add(i);
      }
      fit = await generateFit({
        ingredient: entry,
        userPayload: {
          ingredient: {
            name: entry.display_name,
            category: entry.category,
            what_it_is: entry.what_it_is,
          },
          hairProfile: hair ?? {},
          healthProfile: health ?? {},
          goals: goalRes.data ?? [],
          context: {
            ...(body.context ?? {}),
            avoid_ingredients: [...avoidIngredients].slice(0, 40),
          },
        },
      });
      fit._model_version = FIT_MODEL_VERSION;
      fit._profile_fingerprint = fingerprint;
      fit._generated_at = new Date().toISOString();

      const { data: prior } = await supabase
        .from("ai_summaries")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", cacheKind)
        .maybeSingle();
      if (prior?.id) {
        await supabase.from("ai_summaries")
          .update({ payload: fit as unknown as object, updated_at: new Date().toISOString() })
          .eq("id", prior.id);
      } else {
        await supabase.from("ai_summaries")
          .insert({ user_id: user.id, kind: cacheKind, payload: fit as unknown as object });
      }
    }

    const response = {
      glossary: entry,
      role_in_product: roleInProduct,
      product_category: productCategory,
      fit,
    };
    return json(200, await sanitiseAndLog(response, "ingredient-explainer"));
  } catch (e) {
    return aiErrorResponse(e, "ingredient-explainer");
  }
});
