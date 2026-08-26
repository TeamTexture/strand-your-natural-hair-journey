// Server-side sensitivity loader + enforcement helpers.
//
// Allergy data is special-category health data and is stored encrypted, so it
// can never be matched in SQL. Every match runs here, in memory, after
// decrypting with the same libsodium `nonce || ciphertext` scheme used by
// data-encrypt-batch / data-decrypt-context. Nothing decrypted is ever logged.

import _sodium from "https://esm.sh/libsodium-wrappers@0.7.13";
import {
  scanText,
  type ScanHit,
  type SensitivityEntry,
  type SensitivityScope,
} from "./allergen-aliases.ts";

export type { SensitivityEntry, SensitivityScope, ScanHit };

declare const Deno: { env: { get(key: string): string | undefined } };

let cachedKey: Uint8Array | null = null;

async function loadMasterKey(sodium: typeof _sodium): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const b64 = Deno.env.get("STRAND_CLINICAL_MASTER_KEY");
  if (!b64) throw new Error("STRAND_CLINICAL_MASTER_KEY not configured");
  const key = sodium.from_base64(b64.trim(), sodium.base64_variants.ORIGINAL);
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error("master key wrong length");
  }
  cachedKey = key;
  return key;
}

function byteaToBytes(sodium: typeof _sodium, field: unknown): Uint8Array | null {
  if (typeof field !== "string" || field.length === 0) return null;
  if (field.startsWith("\\x")) return sodium.from_hex(field.slice(2));
  return sodium.from_base64(field, sodium.base64_variants.ORIGINAL);
}

export function decryptEntries(
  sodium: typeof _sodium,
  key: Uint8Array,
  field: unknown,
): SensitivityEntry[] {
  const bytes = byteaToBytes(sodium, field);
  if (!bytes) return [];
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  if (bytes.length < nonceLen + 1) return [];
  const nonce = bytes.slice(0, nonceLen);
  const ct = bytes.slice(nonceLen);
  const text = sodium.to_string(
    sodium.crypto_secretbox_open_easy(ct, nonce, key),
  );
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.label === "string")
      .map((e) => ({
        code: typeof e.code === "string" ? e.code : null,
        label: String(e.label),
        severity: e.severity === "limit" || e.severity === "dislike"
          ? e.severity
          : "avoid",
        custom: !!e.custom,
      })) as SensitivityEntry[];
  } catch {
    return [];
  }
}

interface MinimalClient {
  from: (t: string) => any;
}

export interface LoadedSensitivities {
  all: SensitivityEntry[];
  avoid: SensitivityEntry[];
  limit: SensitivityEntry[];
  dislike: SensitivityEntry[];
}

const EMPTY: LoadedSensitivities = { all: [], avoid: [], limit: [], dislike: [] };

/** Read + decrypt one scope for the caller. Never throws — returns empty. */
export async function loadSensitivities(
  supabase: MinimalClient,
  userId: string,
  scope: SensitivityScope,
): Promise<LoadedSensitivities> {
  try {
    const { data } = await supabase
      .from("user_sensitivities")
      .select("entries_enc")
      .eq("user_id", userId)
      .eq("applies_to", scope)
      .maybeSingle();
    const enc = (data as { entries_enc?: unknown } | null)?.entries_enc;
    if (!enc) return EMPTY;
    await _sodium.ready;
    const sodium = _sodium;
    const key = await loadMasterKey(sodium);
    const all = decryptEntries(sodium, key, enc);
    return {
      all,
      avoid: all.filter((e) => e.severity === "avoid"),
      limit: all.filter((e) => e.severity === "limit"),
      dislike: all.filter((e) => e.severity === "dislike"),
    };
  } catch (e) {
    // Log the error class only — never the payload.
    console.error(
      "[sensitivities] load failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return EMPTY;
  }
}

/** Prompt block naming the exclusions. Pre-generation filter. */
export function sensitivityConstraintBlock(
  s: LoadedSensitivities,
  scope: SensitivityScope,
): string {
  if (s.all.length === 0) return "";
  const lines: string[] = [];
  if (s.avoid.length > 0) {
    lines.push(
      `HARD EXCLUSIONS — these are allergies or true ${
        scope === "dietary" ? "food" : "skin"
      } sensitivities. They must NEVER appear, in any form, under any name, including derivatives and hidden sources: ${
        s.avoid.map((e) => e.label).join("; ")
      }. Substitute, never subtract: build the same nutrient or the same job from something permitted, and still return the full number of items.`,
    );
  }
  if (s.limit.length > 0) {
    lines.push(
      `LIMIT — the member tolerates these in small amounts. Use sparingly and never as the headline of an item: ${
        s.limit.map((e) => e.label).join("; ")
      }.`,
    );
  }
  if (s.dislike.length > 0) {
    lines.push(
      `DISLIKES — safe, simply not wanted. Prefer alternatives where there is a choice: ${
        s.dislike.map((e) => e.label).join("; ")
      }.`,
    );
  }
  lines.push(
    "Never present the exclusion list back to the member as a warning list, and never claim a plan is allergen-free.",
  );
  return `\n\nALLERGY AND SENSITIVITY CONSTRAINTS (BINDING)\n${lines.join("\n")}`;
}

/**
 * Deterministic post-generation validation. Returns every hard-exclusion hit
 * across the supplied strings.
 */
export function validateAgainstAvoid(
  strings: string[],
  s: LoadedSensitivities,
  scope: SensitivityScope,
): ScanHit[] {
  if (s.avoid.length === 0) return [];
  const seen = new Set<string>();
  const out: ScanHit[] = [];
  for (const str of strings) {
    for (const hit of scanText(str ?? "", s.avoid, scope)) {
      const k = `${hit.label}|${hit.term}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(hit);
    }
  }
  return out;
}
