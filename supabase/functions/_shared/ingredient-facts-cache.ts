// ── SHARED PRODUCT-LEVEL INGREDIENT FACTS (2026-09-01) ────────────────────
//
// WHY THIS EXISTS. An INCI list and what each molecule physically does are
// TRUE FOR EVERY MEMBER. Until now the whole analysis payload — the ingredient
// cards included — was cached in `ai_summaries`, which is UNIQUE(user_id, kind)
// and RLS-scoped per user, so the second member to scan the same bottle paid
// again for the same 20-30 ingredient cards. Only the personal half (score,
// relevance note, guidance, tips) is genuinely per-member.
//
// This module is the split:
//   • `public.product_ingredient_facts` holds the product-keyed, user-
//     independent facts (name, category, mechanism sentence, base tone).
//   • On a hit the model is asked for the PERSONALISATION ONLY and the cards
//     are rebuilt deterministically from the cached facts, so a popular
//     product costs a short personalisation pass instead of a full analysis.
//
// SAFETY: nothing member-specific is ever written here. The `sensitivity` flag
// on a card, the score, the relevance note and the guidance are all applied
// per request by the caller AFTER the cards are rebuilt, exactly as before.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface SharedIngredientFact {
  name: string;
  category: string | null;
  body: string | null;
  /** Base tone before any member-specific sensitivity overlay. */
  tone: "good" | "warn" | "bad";
}

export interface SharedFactsRow {
  identity_key: string;
  ingredients_hash: string;
  model_version: string;
  facts: SharedIngredientFact[];
}

const TABLE = "product_ingredient_facts";

/** Lowercase, de-accented, punctuation-free identity — mirrors the client's
 *  `productIdentity()` (src/lib/productIdentity.ts) so the same bottle scanned
 *  by two members resolves to the same shared row even when the stored
 *  `product_key` differs (legacy per-member keys). */
export function factsIdentityKey(name: string, brand?: string | null): string {
  const norm = (v: string) =>
    (v ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[™®©]/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const n = norm(name);
  const b = norm(brand ?? "");
  const brandToken = b.split(" ")[0] ?? "";
  const nameOnly = brandToken && n.startsWith(`${brandToken} `)
    ? n.slice(brandToken.length + 1)
    : n;
  const compact = nameOnly.replace(/ /g, "");
  const key = brandToken ? `${brandToken}:${compact}` : compact;
  return key.slice(0, 120);
}

/** Order-insensitive digest of the verified INCI list. A different formula is
 *  a different row — a reformulation can never serve the old mechanisms. */
export async function ingredientsHash(names: string[]): Promise<string> {
  const canon = [...new Set(
    (names ?? [])
      .map((n) => String(n ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""))
      .filter(Boolean),
  )].sort().join("|");
  if (!canon) return "empty";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
  return [...new Uint8Array(buf)].slice(0, 10)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
type Client = any;

let adminClient: Client | null = null;
async function admin(): Promise<Client | null> {
  if (adminClient) return adminClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  // @ts-ignore — esm.sh URL import is Deno-native; frontend tsc can't resolve it.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

function cleanFact(raw: unknown): SharedIngredientFact | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  if (!name) return null;
  const tone = r.tone === "warn" || r.tone === "bad" ? r.tone : "good";
  const body = r.body == null ? null : String(r.body).trim() || null;
  return {
    name,
    category: r.category == null ? null : String(r.category).trim() || null,
    body,
    tone,
  };
}

/**
 * The shared facts for this exact product + formula, or null.
 * Never throws — a cache problem must only cost speed, never the analysis.
 */
export async function readSharedFacts(args: {
  productName: string;
  productBrand?: string | null;
  ingredients: string[];
  modelVersion: string;
}): Promise<{
  identityKey: string;
  hash: string;
  facts: SharedIngredientFact[];
  /** True when every supplied ingredient has a fact with a real mechanism. */
  complete: boolean;
} | null> {
  const identityKey = factsIdentityKey(args.productName, args.productBrand);
  const hash = await ingredientsHash(args.ingredients);
  if (!identityKey || hash === "empty") return null;
  try {
    const db = await admin();
    if (!db) return null;
    const { data } = await db
      .from(TABLE)
      .select("facts")
      .eq("identity_key", identityKey)
      .eq("ingredients_hash", hash)
      .eq("model_version", args.modelVersion)
      .maybeSingle();
    const facts = ((data?.facts ?? []) as unknown[])
      .map(cleanFact)
      .filter((f): f is SharedIngredientFact => f !== null);
    if (facts.length === 0) return null;
    return {
      identityKey,
      hash,
      facts,
      complete: factsCoverIngredients(facts, args.ingredients),
    };
  } catch (e) {
    console.warn("[facts-cache] read failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Every supplied ingredient has a card AND that card carries a mechanism. */
export function factsCoverIngredients(
  facts: SharedIngredientFact[],
  ingredients: string[],
): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const byName = new Map(facts.map((f) => [norm(f.name), f]));
  const wanted = [...new Set(ingredients.map((i) => norm(String(i ?? ""))).filter(Boolean))];
  if (wanted.length === 0) return false;
  return wanted.every((w) => {
    const hit = byName.get(w);
    return !!hit && typeof hit.body === "string" && hit.body.length > 20;
  });
}

/**
 * Persist the user-independent half of a completed analysis. Only called with
 * cards that already passed the content-integrity guardrail, so nothing
 * unverified is ever shared onward to another member.
 */
export async function writeSharedFacts(args: {
  productName: string;
  productBrand?: string | null;
  ingredients: string[];
  modelVersion: string;
  cards: Array<{ name?: unknown; category?: unknown; body?: unknown; tone?: unknown; sensitivity?: unknown }>;
  sourceFunction: string;
}): Promise<void> {
  const identityKey = factsIdentityKey(args.productName, args.productBrand);
  const hash = await ingredientsHash(args.ingredients);
  if (!identityKey || hash === "empty") return;
  // A member-specific sensitivity overlay can push a card's tone to "bad" for
  // HER only. Never publish that: the shared row must hold the formula's own
  // baseline, so a set carrying any sensitivity flag is not shared at all.
  if ((args.cards ?? []).some((c) => c?.sensitivity === true)) return;
  const facts = (args.cards ?? [])
    .map(cleanFact)
    .filter((f): f is SharedIngredientFact => f !== null);
  // A partial set is worse than none: it would be reused as "complete facts".
  if (!factsCoverIngredients(facts, args.ingredients)) return;
  try {
    const db = await admin();
    if (!db) return;
    await db.from(TABLE).upsert({
      identity_key: identityKey,
      ingredients_hash: hash,
      model_version: args.modelVersion,
      product_name: args.productName,
      product_brand: args.productBrand ?? null,
      ingredient_names: args.ingredients,
      facts,
      source_function: args.sourceFunction,
      updated_at: new Date().toISOString(),
    }, { onConflict: "identity_key,ingredients_hash,model_version" });
    console.log(JSON.stringify({
      event: "shared_facts_write",
      function: args.sourceFunction,
      identity_key: identityKey,
      ingredients: facts.length,
    }));
  } catch (e) {
    console.warn("[facts-cache] write failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Prompt block for a cache HIT: the cards are already written, so the model is
 * told not to produce them and to spend its whole budget on this member.
 */
export function sharedFactsBlock(facts: SharedIngredientFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts
    .map((f) => `- ${f.name}${f.category ? ` [${f.category}]` : ""}: ${f.body ?? "not established"}`)
    .join("\n");
  return `

VERIFIED INGREDIENT FACTS FOR THIS EXACT PRODUCT — ALREADY WRITTEN, DO NOT REPRODUCE:
Every ingredient in this formula has already been analysed and validated for this exact ingredient list, and the sentences below are what this member will see on the ingredient cards. They are facts about the formula, not about her.
DO NOT return the ingredients array at all — it is supplied for you and will be attached to your answer automatically. Do not re-describe, re-order, correct, expand or contradict any line below.
Use these mechanisms as your evidence, and spend ALL of your output on the personal half: the score, why it scored that way for HER recorded characteristics, goal, challenges and areas of concern, the relevance note, the purpose insight and the how-to-use guidance.
${lines}`;
}

/**
 * Rebuild the ingredient cards from the shared facts, in the order of the
 * member's verified INCI list. Any model-returned card is preferred only when
 * the shared set has no fact for that ingredient.
 */
export function rebuildCardsFromFacts(
  ingredients: string[],
  facts: SharedIngredientFact[],
  modelCards?: Array<{ name?: unknown; tone?: unknown; category?: unknown; body?: unknown }>,
): Array<{ name: string; tone: "good" | "warn" | "bad"; category: string | null; body: string | null }> {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const byName = new Map(facts.map((f) => [norm(f.name), f]));
  const modelByName = new Map(
    (modelCards ?? [])
      .map((c) => cleanFact(c))
      .filter((c): c is SharedIngredientFact => c !== null)
      .map((c) => [norm(c.name), c]),
  );
  return ingredients
    .map((raw) => String(raw ?? "").trim())
    .filter(Boolean)
    .map((name) => {
      const hit = byName.get(norm(name)) ?? modelByName.get(norm(name));
      return {
        name,
        tone: hit?.tone ?? "good",
        category: hit?.category ?? null,
        body: hit?.body ?? null,
      };
    });
}
