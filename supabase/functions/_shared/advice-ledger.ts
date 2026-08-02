// advice-ledger — "once given, never repeated".
//
// Every guidance-generating function reads the user's recent advice ledger
// BEFORE generating (so the model can avoid restating the same action in new
// wording) and writes the actions it just gave AFTER generating.
//
// Keys are normalised action fingerprints, e.g. "deep-condition-weekly-heat",
// "two-step-cleanse", "low-tension-styles".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

declare const Deno: { env: { get(k: string): string | undefined } };

type Client = { from: (t: string) => any };

/** Service-role client so ledger writes are never blocked by RLS. */
function ledgerClient(): Client | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key) as unknown as Client;
}

const WINDOW_DAYS = 14;

/** Stopwords stripped before fingerprinting an action line. */
const STOP = new Set([
  "a", "an", "and", "the", "your", "you", "yours", "to", "of", "in", "on", "for",
  "with", "at", "is", "are", "be", "it", "its", "this", "that", "as", "so",
  "then", "than", "into", "onto", "from", "by", "or", "but", "if", "when",
  "while", "each", "every", "all", "any", "more", "most", "some", "will",
  "can", "should", "must", "do", "does", "keep", "make", "get", "use", "using",
  "before", "after", "up", "down", "out", "over", "about", "just", "very",
  "not", "no", "my", "me", "we", "our", "hair", "strand", "strands",
]);

/** Crude but stable stemmer — plural / -ing / -ed endings only. */
const stem = (w: string): string => {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};

/**
 * Normalise a free-text action line into a stable action_key.
 * Returns "" when there is nothing meaningful left.
 */
export function actionKey(text: string): string {
  const words = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
  // Keep the first few meaningful tokens, sorted so wording order doesn't
  // create two keys for the same action.
  const uniq = Array.from(new Set(words)).sort().slice(0, 4);
  return uniq.join("-");
}

/** Best-effort user id from the caller's bearer token (JWT sub claim). */
export function userIdFromRequest(req: Request): string | null {
  try {
    const raw = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const part = raw.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")),
    );
    return typeof json?.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

export interface LedgerEntry {
  action_key: string;
  headline: string | null;
  surface: string;
}

/** Fetch the user's advice from the last 14 days. */
export async function fetchAdviceLedger(userId: string): Promise<LedgerEntry[]> {
  const admin = ledgerClient();
  if (!admin) return [];
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
    const { data } = await admin
      .from("user_advice_ledger")
      .select("action_key, headline, surface")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    return (data ?? []) as LedgerEntry[];
  } catch {
    return [];
  }
}

/**
 * Prompt block listing advice the user has already been given.
 * Returns "" when the ledger is empty, so prompts stay clean for new users.
 */
export function buildAdviceLedgerBlock(entries: LedgerEntry[]): string {
  const lines = entries
    .map((e) => (e.headline ?? e.action_key ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!lines.length) return "";
  return [
    "ADVICE ALREADY GIVEN TO THIS USER (do not restate in any wording):",
    ...lines.map((l) => `- ${l}`),
    "",
    "If one of these is still the single most important action, reference it in MAX ONE short clause (e.g. \"keep up your weekly deep condition\") and spend the rest of your output on the NEXT most valuable distinct teaching for this user. Restating listed advice, even reworded, is an error.",
  ].join("\n");
}

/**
 * Record the actions just given. Silently ignores failures — a ledger write
 * must never break a generation response.
 */
export async function recordAdvice(
  userId: string,
  surface: string,
  lines: Array<string | null | undefined>,
): Promise<void> {
  const rows = Array.from(
    new Map(
      lines
        .map((l) => (l ?? "").trim())
        .filter(Boolean)
        .map((headline) => [actionKey(headline), headline] as const)
        .filter(([key]) => key.length > 0),
    ).entries(),
  ).map(([action_key, headline]) => ({
    user_id: userId,
    surface,
    action_key,
    headline: headline.slice(0, 160),
    created_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const admin = ledgerClient();
  if (!admin) return;
  try {
    await admin
      .from("user_advice_ledger")
      .upsert(rows, { onConflict: "user_id,surface,action_key" });
  } catch {
    /* non-fatal */
  }
}
