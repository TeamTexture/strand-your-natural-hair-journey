// editorial-products — the wall between STRAND's editorial voice and paid media.
//
// Card 1 on the Wash Day screen (and the style tip) is STRAND's OWN guidance.
// It may name a product the member has on her own shelf, because that is
// legitimate personalisation. It may NEVER name:
//   1. a product attached to a LIVE (or paid+scheduled, in-window) sponsored
//      campaign in ANY slot — that is undisclosed advertising, and it also
//      gives away for free the placement the brand is paying for; or
//   2. a brand-catalogue product the member does not own — if it is not hers
//      and nobody is paying for it, it has no business being named.
//
// The exclusion list is resolved server-side from the database (never trusted
// from the client) and enforced in TWO places: the prompt, and a
// post-generation check that forces a regeneration.

type Admin = {
  from: (t: string) => {
    select: (c: string) => any;
  };
};

export interface EditorialProductGuard {
  /** Product names attached to live/in-window sponsored campaigns. */
  sponsored: string[];
  /** Brand-catalogue product names the member does NOT have on her shelf. */
  unownedCatalogue: string[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Build the exclusion list for the editorial card. */
export async function buildEditorialProductGuard(
  admin: Admin,
  shelfProducts: Array<{ name?: string; brand?: string | null }> = [],
): Promise<EditorialProductGuard> {
  const today = new Date().toISOString().slice(0, 10);
  const shelf = new Set(
    shelfProducts.map((p) => norm(String(p?.name ?? ""))).filter(Boolean),
  );

  let sponsored: string[] = [];
  let unownedCatalogue: string[] = [];
  try {
    // 1. Every offer that is live or paid+scheduled AND inside its window,
    //    in any slot.
    const { data: offers } = await (admin as any)
      .from("brand_offers")
      .select("id")
      .in("status", ["live", "paid_scheduled"])
      .lte("starts_on", today)
      .gte("ends_on", today);
    const offerIds = ((offers ?? []) as Array<{ id: string }>).map((o) => o.id);

    if (offerIds.length > 0) {
      const { data: attached } = await (admin as any)
        .from("brand_offer_products")
        .select("brand_products(name)")
        .in("offer_id", offerIds);
      sponsored = ((attached ?? []) as Array<{ brand_products?: { name?: string } | null }>)
        .map((r) => String(r?.brand_products?.name ?? "").trim())
        .filter((n) => n.length >= 4);
    }

    // 2. Brand-catalogue names the member does not own.
    const { data: catalogue } = await (admin as any)
      .from("brand_products")
      .select("name")
      .limit(2000);
    unownedCatalogue = ((catalogue ?? []) as Array<{ name?: string }>)
      .map((r) => String(r?.name ?? "").trim())
      .filter((n) => n.length >= 6 && !shelf.has(norm(n)));
  } catch (e) {
    console.warn("[editorial-products] guard build failed (open-fail):", e);
  }

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
  return { sponsored: dedupe(sponsored), unownedCatalogue: dedupe(unownedCatalogue) };
}

/** The prompt block. Named products only, never a rule the model has to infer. */
export function editorialProductBlock(guard: EditorialProductGuard): string {
  if (guard.sponsored.length === 0) return "";
  return [
    "",
    "",
    "PAID-MEDIA WALL — NON-NEGOTIABLE. This tip is STRAND's own editorial guidance, not an advert.",
    "The following product names are the subject of a paid campaign right now and MUST NOT appear anywhere in your output, even if this member owns them:",
    ...guard.sponsored.map((n) => `- ${n}`),
    'If one of those products would have been your suggestion, describe the product TYPE instead (e.g. "a creamy leave-in", "a water-based scalp cleanser") and name nothing.',
    "You may still name any OTHER product on this member's own shelf. Never name a product that is not on her shelf.",
  ].join("\n");
}

const collectStrings = (value: unknown, out: string[]): void => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
};

/** POST-GENERATION CHECK. Returns the excluded product names that appear in
 *  the payload — empty means the output is clean. */
export function findExcludedProducts(
  payload: unknown,
  names: string[],
): string[] {
  const strings: string[] = [];
  collectStrings(payload, strings);
  const haystack = norm(strings.join(" \n "));
  return names.filter((n) => haystack.includes(norm(n)));
}

/** Last-resort repair so a violation never reaches the member and never
 *  blanks the card: the offending product name (and any brand word glued to
 *  the front of it) is replaced with a neutral product-type phrase. */
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
          new RegExp(`(?:\\b[A-Z][\\w'’&-]*\\s+)?${esc}`, "gi"),
          "a suitable product from your own shelf",
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
