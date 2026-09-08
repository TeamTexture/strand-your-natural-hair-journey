// Server-side decrypt of a single encrypted text column, using the same
// libsodium `nonce || ciphertext` scheme as data-encrypt-batch /
// data-decrypt-context. Nothing decrypted is ever logged.
import _sodium from "https://esm.sh/libsodium-wrappers@0.7.13";

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

/** PostgREST returns bytea as `\x<hex>`; some paths return base64. Accept both. */
function byteaToBytes(sodium: typeof _sodium, field: unknown): Uint8Array | null {
  if (typeof field !== "string" || field.length === 0) return null;
  if (field.startsWith("\\x")) return sodium.from_hex(field.slice(2));
  return sodium.from_base64(field, sodium.base64_variants.ORIGINAL);
}

/** Decrypt one encrypted text column. Returns null when there is nothing to read. */
export async function decryptText(field: unknown): Promise<string | null> {
  const b64 = Deno.env.get("STRAND_CLINICAL_MASTER_KEY");
  if (!b64) return null;
  await _sodium.ready;
  const sodium = _sodium;
  const key = await loadMasterKey(sodium);
  const bytes = byteaToBytes(sodium, field);
  if (!bytes) return null;
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  if (bytes.length < nonceLen + 1) return null;
  const nonce = bytes.slice(0, nonceLen);
  const ct = bytes.slice(nonceLen);
  const text = sodium.to_string(sodium.crypto_secretbox_open_easy(ct, nonce, key));
  return text && text.length ? text : null;
}
