// JWT-gated context decrypt helper.
// Reads every encrypted column for the authenticated user across the five
// Phase-1 tables, decrypts in one pass, returns plaintext slices that
// src/lib/aiContext.ts merges with its plaintext DB reads.
//
// 5xx on any decrypt failure — never silently mask. The wash-day fallback
// pattern from the audit (heat-treatment-rationale returning canned advice
// on AI failure) is exactly the behaviour we don't want for clinical data.
//
// See docs/PHASE_1_PLAN.md §5 / §7.

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
    throw new Error(
      `master key must decode to ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${key.length}`,
    );
  }
  cachedKey = key;
  return key;
}

// PostgREST returns bytea as `\x<hex>` by default. Some configurations or
// raw RPC responses return base64. Accept both shapes.
function byteaToBytes(
  sodium: typeof _sodium,
  field: unknown,
): Uint8Array | null {
  if (field == null) return null;
  if (typeof field !== "string") return null;
  if (field.length === 0) return null;
  if (field.startsWith("\\x")) {
    return sodium.from_hex(field.slice(2));
  }
  // Fallback: treat as base64. Will throw if it's neither shape.
  return sodium.from_base64(field, sodium.base64_variants.ORIGINAL);
}

function decryptToString(
  sodium: typeof _sodium,
  key: Uint8Array,
  field: unknown,
): string | null {
  const bytes = byteaToBytes(sodium, field);
  if (!bytes) return null;
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  if (bytes.length < nonceLen + 1) {
    throw new Error("ciphertext too short");
  }
  const nonce = bytes.slice(0, nonceLen);
  const ct = bytes.slice(nonceLen);
  const pt = sodium.crypto_secretbox_open_easy(ct, nonce, key);
  return sodium.to_string(pt);
}

function decryptToArray(
  sodium: typeof _sodium,
  key: Uint8Array,
  field: unknown,
): string[] | null {
  const text = decryptToString(sodium, key, field);
  if (text == null) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function decryptToNumber(
  sodium: typeof _sodium,
  key: Uint8Array,
  field: unknown,
): number | null {
  const text = decryptToString(sodium, key, field);
  if (text == null || text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
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
    const userId = u.user.id;

    await _sodium.ready;
    const sodium = _sodium;
    const key = await loadMasterKey(sodium);

    // RLS scopes each query to the caller's own rows.
    const [hairRes, healthRes, proRes, medsRes, bloodRes] = await Promise.all([
      supabase
        .from("user_hair_profile")
        .select("scalp_condition_enc, diagnosed_conditions_enc")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_health_profile")
        .select("life_stage_enc, contraception_enc, medical_conditions_enc")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_professionals")
        .select("gmc_number_enc, iot_number_enc, notes_enc")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_medications")
        .select("id, name_enc, category_enc")
        .eq("user_id", userId),
      supabase
        .from("blood_results")
        .select("id, value_enc, unit_enc")
        .eq("user_id", userId),
    ]);

    const hair = hairRes.data
      ? {
          scalp_condition: decryptToString(
            sodium,
            key,
            hairRes.data.scalp_condition_enc,
          ),
          diagnosed_conditions:
            decryptToArray(sodium, key, hairRes.data.diagnosed_conditions_enc) ??
            [],
        }
      : null;

    const health = healthRes.data
      ? {
          life_stage: decryptToString(
            sodium,
            key,
            healthRes.data.life_stage_enc,
          ),
          contraception:
            decryptToArray(sodium, key, healthRes.data.contraception_enc) ?? [],
          medical_conditions:
            decryptToArray(
              sodium,
              key,
              healthRes.data.medical_conditions_enc,
            ) ?? [],
        }
      : null;

    const professional = proRes.data
      ? {
          gmc_number: decryptToString(
            sodium,
            key,
            proRes.data.gmc_number_enc,
          ),
          iot_number: decryptToString(
            sodium,
            key,
            proRes.data.iot_number_enc,
          ),
          notes: decryptToString(sodium, key, proRes.data.notes_enc),
        }
      : null;

    const medications = (medsRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: decryptToString(sodium, key, row.name_enc) ?? "",
      category: decryptToString(sodium, key, row.category_enc),
    }));

    const bloodResults = (bloodRes.data ?? []).map((row) => ({
      id: row.id as string,
      value: decryptToNumber(sodium, key, row.value_enc),
      unit: decryptToString(sodium, key, row.unit_enc),
    }));

    return json(200, {
      hair,
      health,
      professional,
      medications,
      bloodResults,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "decrypt failed";
    // Log error class only — never log decrypted payloads (audit §4 finding
    // about blood-ai-summary console.error of payload bodies).
    console.error("data-decrypt-context failed:", msg);
    return json(500, { error: msg });
  }
});
