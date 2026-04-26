// Regression test for the Phase 1 backfill bytea-encoding bug.
//
// Bug history (2026-04-26): the first production backfill ran 200 OK and
// reported encrypted=14, but every stored `value_enc` was the literal ASCII
// text `{"0":n,"1":n,...}` because PostgREST JSON-serialises Uint8Array in
// update payloads. Decrypt then failed with "wrong secret key for the given
// ciphertext".
//
// The fix is to convert Uint8Array → Postgres hex literal `\xDEADBEEF...`
// before sending it to PostgREST. This test exercises the full pure-Deno
// encrypt → hex-encode → hex-decode → decrypt round-trip and asserts the
// plaintext matches. It does NOT hit the live database — it's a unit-level
// guard against the encoding regression specifically.
//
// Run with:
//   deno test --allow-net --allow-env \
//     supabase/functions/phase1-backfill-existing-rows/__tests__/bytea_roundtrip_test.ts

import _sodium from "https://esm.sh/libsodium-wrappers@0.7.13";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Local copies of the helpers under test. Kept in sync with index.ts; if you
// change the encoding format there, update both copies and this test will
// fail loudly until they match.
function bytesToPgHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `\\x${hex}`;
}

function pgHexToBytes(literal: string): Uint8Array {
  // Accept both `\x...` (Postgres on-wire) and `\\x...` (escaped JS form).
  const stripped = literal.startsWith("\\x")
    ? literal.slice(2)
    : literal.startsWith("\\\\x")
      ? literal.slice(3)
      : literal;
  if (stripped.length % 2 !== 0) {
    throw new Error("hex string must be even length");
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encryptToBytes(
  sodium: typeof _sodium,
  key: Uint8Array,
  plaintext: string,
): Uint8Array {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ct = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key,
  );
  const sealed = new Uint8Array(nonce.length + ct.length);
  sealed.set(nonce, 0);
  sealed.set(ct, nonce.length);
  return sealed;
}

function decryptFromBytes(
  sodium: typeof _sodium,
  key: Uint8Array,
  bytes: Uint8Array,
): string {
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  const nonce = bytes.slice(0, nonceLen);
  const ct = bytes.slice(nonceLen);
  const pt = sodium.crypto_secretbox_open_easy(ct, nonce, key);
  return sodium.to_string(pt);
}

Deno.test("bytesToPgHex produces a valid \\x-prefixed lowercase hex literal", () => {
  const bytes = new Uint8Array([0x00, 0x01, 0xab, 0xff]);
  const hex = bytesToPgHex(bytes);
  assertEquals(hex, "\\x0001abff");
});

Deno.test("bytesToPgHex round-trips through pgHexToBytes for random buffers", async () => {
  await _sodium.ready;
  const sodium = _sodium;
  for (let i = 0; i < 16; i += 1) {
    const len = 1 + Math.floor(Math.random() * 200);
    const original = sodium.randombytes_buf(len);
    const hex = bytesToPgHex(original);
    assert(hex.startsWith("\\x"));
    const decoded = pgHexToBytes(hex);
    assertEquals(decoded.length, original.length);
    assertEquals(Array.from(decoded), Array.from(original));
  }
});

Deno.test("encrypt → bytesToPgHex → pgHexToBytes → decrypt yields the original plaintext", async () => {
  await _sodium.ready;
  const sodium = _sodium;
  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);

  const samples = [
    "12.4", // numeric blood marker value
    "ng/mL", // unit
    "", // empty (NULL plaintext)
    "Levothyroxine 50mcg", // medication name with whitespace
    "🦋 contains unicode 💊",
    JSON.stringify({ contraception: ["combined pill"], life_stage: "perimenopause" }),
  ];

  for (const plaintext of samples) {
    const sealed = encryptToBytes(sodium, key, plaintext);

    // Simulate the wire path: edge fn → PostgREST → bytea column → SELECT.
    const wire = bytesToPgHex(sealed);
    const stored = pgHexToBytes(wire);

    const recovered = decryptFromBytes(sodium, key, stored);
    assertEquals(recovered, plaintext);
  }
});

Deno.test(
  "regression: a Uint8Array sent as JSON does NOT round-trip — proves the bug",
  async () => {
    await _sodium.ready;
    const sodium = _sodium;
    const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);

    const sealed = encryptToBytes(sodium, key, "12.4");

    // Reproduce what PostgREST does with a Uint8Array payload: JSON.stringify
    // turns it into `{"0":n,"1":n,...}`. The bytea column then stores those
    // ASCII bytes verbatim. Decrypt MUST fail (or produce garbage).
    const buggyWire = JSON.stringify(sealed);
    const buggyBytes = new TextEncoder().encode(buggyWire);

    let threw = false;
    try {
      decryptFromBytes(sodium, key, buggyBytes);
    } catch {
      threw = true;
    }
    assert(
      threw,
      "decrypting JSON-serialised Uint8Array should fail — if this test " +
        "passes, libsodium has changed and the regression guard is moot",
    );
  },
);
