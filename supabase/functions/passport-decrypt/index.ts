// Passport decrypt helper — decrypts a TARGET member's encrypted clinical
// columns for a caller who is either an admin, or a professional with active
// client access. Enforced by RLS: the caller's JWT is used to read the
// encrypted bytea columns, so anyone else's read returns null and we
// respond 403.
//
// Never returns raw ciphertext. Never logs decrypted payloads.

import _sodium from "https://esm.sh/libsodium-wrappers@0.7.13";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

let cachedKey: Uint8Array | null = null;

async function loadMasterKey(sodium: typeof _sodium): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const b64 = Deno.env.get("STRAND_CLINICAL_MASTER_KEY");
  if (!b64) throw new Error("STRAND_CLINICAL_MASTER_KEY not configured");
  const key = sodium.from_base64(b64.trim(), sodium.base64_variants.ORIGINAL);
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(`master key must decode to ${sodium.crypto_secretbox_KEYBYTES} bytes`);
  }
  cachedKey = key;
  return key;
}

function byteaToBytes(sodium: typeof _sodium, field: unknown): Uint8Array | null {
  if (field == null || typeof field !== "string" || field.length === 0) return null;
  if (field.startsWith("\\x")) return sodium.from_hex(field.slice(2));
  return sodium.from_base64(field, sodium.base64_variants.ORIGINAL);
}

function decryptToString(sodium: typeof _sodium, key: Uint8Array, field: unknown): string | null {
  const bytes = byteaToBytes(sodium, field);
  if (!bytes) return null;
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  if (bytes.length < nonceLen + 1) return null;
  try {
    const nonce = bytes.slice(0, nonceLen);
    const ct = bytes.slice(nonceLen);
    const pt = sodium.crypto_secretbox_open_easy(ct, nonce, key);
    return sodium.to_string(pt);
  } catch {
    return null;
  }
}

function decryptToArray(sodium: typeof _sodium, key: Uint8Array, field: unknown): string[] | null {
  const t = decryptToString(sodium, key, field);
  if (t == null) return null;
  try {
    const p = JSON.parse(t);
    return Array.isArray(p) ? p.map(String) : null;
  } catch { return null; }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing auth" });

    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.target_user_id;
    if (!isUuid(targetUserId)) return json(400, { error: "invalid target_user_id" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json(401, { error: "unauthorized" });

    await _sodium.ready;
    const sodium = _sodium;
    const key = await loadMasterKey(sodium);

    // RLS gates every read — admin OR pro-with-active-consent policies apply.
    const [hairRes, healthRes, proRes, medsRes] = await Promise.all([
      supabase.from("user_hair_profile")
        .select("scalp_condition_enc, diagnosed_conditions_enc")
        .eq("user_id", targetUserId).maybeSingle(),
      supabase.from("user_health_profile")
        .select("life_stage_enc, contraception_enc, medical_conditions_enc")
        .eq("user_id", targetUserId).maybeSingle(),
      supabase.from("user_professionals")
        .select("gmc_number_enc, iot_number_enc, notes_enc")
        .eq("user_id", targetUserId).maybeSingle(),
      supabase.from("user_medications")
        .select("id, name_enc, category_enc")
        .eq("user_id", targetUserId),
    ]);

    // If every clinical read returned nothing, the caller lacks access.
    if (!hairRes.data && !healthRes.data && !proRes.data && (medsRes.data ?? []).length === 0) {
      return json(200, { hair: null, health: null, professional: null, medications: [] });
    }

    const hair = hairRes.data ? {
      scalp_condition: decryptToString(sodium, key, hairRes.data.scalp_condition_enc),
      diagnosed_conditions: decryptToArray(sodium, key, hairRes.data.diagnosed_conditions_enc) ?? [],
    } : null;

    const health = healthRes.data ? {
      life_stage: decryptToString(sodium, key, healthRes.data.life_stage_enc),
      contraception: decryptToArray(sodium, key, healthRes.data.contraception_enc) ?? [],
      medical_conditions: decryptToArray(sodium, key, healthRes.data.medical_conditions_enc) ?? [],
    } : null;

    const professional = proRes.data ? {
      gmc_number: decryptToString(sodium, key, proRes.data.gmc_number_enc),
      iot_number: decryptToString(sodium, key, proRes.data.iot_number_enc),
      notes: decryptToString(sodium, key, proRes.data.notes_enc),
    } : null;

    const medications = (medsRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: decryptToString(sodium, key, row.name_enc),
      category: decryptToString(sodium, key, row.category_enc),
    }));

    return json(200, { hair, health, professional, medications });
  } catch (e) {
    console.error("passport-decrypt failed:", e instanceof Error ? e.message : "unknown");
    return json(500, { error: "decrypt failed" });
  }
});
