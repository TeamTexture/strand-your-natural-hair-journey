// JWT-gated batch encryption helper.
// Encrypts an array of plaintext strings using the master key in
// STRAND_CLINICAL_MASTER_KEY (Lovable Cloud Secrets) and returns base64-encoded
// AEAD blobs of the form `nonce(24) || ciphertext`. The caller is responsible
// for converting the returned base64 to bytes and writing into the relevant
// `*_enc bytea` column.
//
// See docs/PHASE_1_PLAN.md §2 / §7 / §A.1.

import _sodium from "https://esm.sh/libsodium-wrappers@0.7.13";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  items: Array<{ id: string; plaintext: string }>;
}

// PostgREST treats a Uint8Array sent in an update payload as JSON and stores
// the literal `{"0":n,...}` text into the bytea column. The right wire format
// is Postgres's hex bytea literal, `"\\xDEADBEEF..."`, which decodes to the
// raw bytes server-side. We return both base64 (for non-DB use cases) and
// pg_hex (for direct PostgREST writes) so callers can never get this wrong.
//
// Phase 1 audit 2026-04-26: the first backfill silently corrupted 14
// `blood_results.value_enc` rows by sending Uint8Array directly. Returning
// pg_hex here is the structural fix for the client-side hook (see
// `useLocalStorageMigration` in Phase 1 client work).
function bytesToPgHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `\\x${hex}`;
}

const MAX_ITEMS_PER_BATCH = 200;

// Cached across warm invocations; freshly loaded per cold start.
let cachedKey: Uint8Array | null = null;

async function loadMasterKey(sodium: typeof _sodium): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const b64 = Deno.env.get("STRAND_CLINICAL_MASTER_KEY");
  if (!b64) throw new Error("STRAND_CLINICAL_MASTER_KEY not configured");
  const key = sodium.from_base64(b64.trim(), sodium.base64_variants.ORIGINAL);
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `master key must decode to ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${key.length}`,
    );
  }
  cachedKey = key;
  return key;
}

function encrypt(
  sodium: typeof _sodium,
  key: Uint8Array,
  plaintext: string,
): string {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ct = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key,
  );
  const sealed = new Uint8Array(nonce.length + ct.length);
  sealed.set(nonce, 0);
  sealed.set(ct, nonce.length);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing auth" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json(401, { error: "unauthorized" });

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body || !Array.isArray(body.items)) {
      return json(400, { error: "items must be an array" });
    }
    if (body.items.length === 0) return json(200, { items: [] });
    if (body.items.length > MAX_ITEMS_PER_BATCH) {
      return json(400, {
        error: `too many items (max ${MAX_ITEMS_PER_BATCH})`,
      });
    }

    await _sodium.ready;
    const sodium = _sodium;
    const key = await loadMasterKey(sodium);

    const out = body.items.map((item) => {
      if (typeof item?.id !== "string" || typeof item?.plaintext !== "string") {
        throw new Error("each item must have { id: string, plaintext: string }");
      }
      return {
        id: item.id,
        ciphertext_b64: encrypt(sodium, key, item.plaintext),
      };
    });

    return json(200, { items: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "encrypt failed";
    return json(500, { error: msg });
  }
});
