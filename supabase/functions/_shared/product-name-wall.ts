// product-name-wall — Card 1 (the unsponsored wash day / style tip) names NO
// products, full stop.
//
// This REPLACES the earlier exclusion-list approach (_shared/editorial-products.ts,
// deleted). That version allowed shelf product names and excluded only
// live-campaign products, which meant the editorial card's character changed
// depending on whether a brand was paying, and it could leak whenever the
// exclusion list was stale or a name was spelled differently.
//
// The rule now is absolute and cannot leak: the unsponsored tip is purely
// educational — technique, method, sequence, timing and why it matters. It
// refers to product TYPES generically ("a water-based scalp cleanser", "a
// leave-in conditioner", "an emollient") and never to a branded product, not
// even one the member owns.
//
// Enforced in three places:
//   1. the prompt (noProductNamesBlock)
//   2. a post-generation check that forces ONE regeneration (findProductNames)
//   3. a final redaction so a leak can never reach the member (redactProductNames)
//
// Product recommendations still belong everywhere else — product pages, shelf
// guidance and the sponsored card. This module governs Card 1 only.

type Admin = {
  from: (t: string) => {
    select: (c: string) => any;
  };
};

export interface ProductNameWall {
  /** Every product name that must not appear in the editorial tip. */
  names: string[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const dedupe = (xs: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = norm(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
};

/**
 * Build the forbidden-name index: EVERY brand-catalogue product plus every
 * product on this member's own shelf. No campaign status is consulted — there
 * is no exclusion list any more, only "no product names".
 *
 * Resolved server-side with the service client; names sent by the client are
 * only ever added to the forbidden set, never trusted to shrink it.
 */
export async function buildProductNameWall(
  admin: Admin,
  userId: string,
  shelfProducts: Array<{ name?: string; brand?: string | null }> = [],
): Promise<ProductNameWall> {
  const names: string[] = shelfProducts
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 4);

  try {
    const { data: catalogue } = await (admin as any)
      .from("brand_products")
      .select("name")
      .limit(5000);
    for (const row of (catalogue ?? []) as Array<{ name?: string }>) {
      const n = String(row?.name ?? "").trim();
      if (n.length >= 4) names.push(n);
    }
  } catch (e) {
    console.warn("[product-name-wall] catalogue read failed (open-fail):", e);
  }

  try {
    const { data: owned } = await (admin as any)
      .from("user_products")
      .select("name")
      .eq("user_id", userId)
      .limit(500);
    for (const row of (owned ?? []) as Array<{ name?: string }>) {
      const n = String(row?.name ?? "").trim();
      if (n.length >= 4) names.push(n);
    }
  } catch (e) {
    console.warn("[product-name-wall] shelf read failed (open-fail):", e);
  }

  return { names: dedupe(names) };
}

/** The prompt block. A rule, not a list — the list would be far too long to
 *  send and the rule admits no exceptions anyway. */
export function noProductNamesBlock(): string {
  return [
    "",
    "",
    "NO PRODUCT NAMES — NON-NEGOTIABLE. This tip is STRAND's own educational guidance, never an advert.",
    "Do not name ANY product, from ANY brand, anywhere in your output — not in the headline, the action, the reason, the why, the technique or the next-time suggestion. This includes products this member already owns and products she has logged herself.",
    "Do not name a brand either (no Cantu, no Nylah's, no anything) and do not describe a product so specifically that it identifies one product.",
    'Refer to product TYPES generically instead: "a water-based scalp cleanser", "a lightweight water-based serum", "a leave-in conditioner", "a thick gel", "an emollient cream", "a moisturising conditioner".',
    "Teach the technique, the method, the sequence, the timing and why it matters. That is the whole job of this card.",
  ].join("\n");
}

const collectStrings = (value: unknown, out: string[]): void => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
};

/** POST-GENERATION CHECK. Returns the product names that appear in the payload
 *  — empty means the tip is clean and may be served. */
export function findProductNames(payload: unknown, names: string[]): string[] {
  const strings: string[] = [];
  collectStrings(payload, strings);
  const haystack = norm(strings.join(" \n "));
  return names.filter((n) => haystack.includes(norm(n)));
}

/** Last-resort repair so a leak never reaches the member and the card never
 *  renders empty: the product name (and any brand token glued to the front of
 *  it) is replaced with a generic product-type phrase. */
export function redactProductNames<T>(value: T, names: string[]): T {
  if (names.length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      let s = v;
      for (const n of names) {
        const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        // Swallow an immediately preceding brand-style token (CANTU, Cantu's…)
        // so "your CANTU Ultra Moisture Leave-In" degrades cleanly.
        s = s.replace(
          new RegExp(`(?:\\byour\\s+)?(?:\\b[A-Z][\\w'’&-]*\\s+)?${esc}`, "gi"),
          "a suitable product of that type",
        );
      }
      return s.replace(/[ \t]{2,}/g, " ");
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

// ── MINIMAL-LEVEL WORD CAPS ────────────────────────────────────────────────
// Support level 1 promises "one clear next step". A 40-word action breaks that
// promise, so the caps are VALIDATED, not merely requested in the prompt.
export const MINIMAL_ACTION_WORD_CAP = 20;
export const MINIMAL_REASON_WORD_CAP = 18;

export const wordCount = (s: string) =>
  (s ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;

export function minimalCapViolations(input: { action: string; reason: string }): string[] {
  const out: string[] = [];
  if (wordCount(input.action) > MINIMAL_ACTION_WORD_CAP) out.push("action_over_minimal_cap");
  if (wordCount(input.reason) > MINIMAL_REASON_WORD_CAP) out.push("reason_over_minimal_cap");
  return out;
}

/** Final trim when the model still overruns after the retry: keep the first
 *  sentence, and only if that is still over cap fall back to a hard word cut.
 *  Never returns an empty string — a trimmed tip beats no tip. */
export function trimToCap(text: string, cap: number): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s || wordCount(s) <= cap) return s;
  const first = s.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
  if (first && wordCount(first) <= cap) return first;
  const words = s.split(" ").slice(0, cap).join(" ").replace(/[,;:]$/, "");
  return /[.!?]$/.test(words) ? words : `${words}.`;
}

export function minimalPromptBlock(): string {
  return [
    "",
    "",
    "MINIMAL LEVEL HARD CAPS — VALIDATED, NOT ADVISORY.",
    `- "action": ONE sentence, MAXIMUM ${MINIMAL_ACTION_WORD_CAP} words. Count them before returning.`,
    `- "reason": ONE sentence, MAXIMUM ${MINIMAL_REASON_WORD_CAP} words. Count them before returning.`,
    '- Return "technique" and "next_time" as empty strings — nothing else is shown at this level.',
    "- Shorter still has to teach: the action stays a real instruction and the reason stays a real why. Cut words, never substance.",
  ].join("\n");
}
