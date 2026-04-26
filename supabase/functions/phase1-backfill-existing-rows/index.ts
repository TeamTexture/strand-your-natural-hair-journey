// Admin-only one-shot backfill.
// Encrypts the existing plaintext clinical data on production rows that
// pre-date Phase 1: blood_results.value/unit and user_medications.name/category.
// Plaintext columns are left in place — Phase 1.5 drops them after the soak
// window. Idempotent: rows whose `_enc` columns are already set are skipped.
//
// Auth gates (BOTH must pass):
//   1) body.confirm === "i-have-set-the-master-key"   (literal hand-typed string)
//   2) caller is the founder, EITHER (a) authenticated email matches
//      PHASE1_ADMIN_EMAIL env secret (no default — must be configured), OR
//      (b) body.adminToken matches BACKFILL_ADMIN_TOKEN env secret.
//
// Deleted in Phase 1.5 — no purpose after the one invocation.
//
// See docs/PHASE_1_PLAN.md §4 / §7.

import _sodium from "https://esm.sh/libsodium-wrappers@0.7.13";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  confirm?: string;
  adminToken?: string;
}

interface BackfillStats {
  encrypted: number;
  skipped: number;
  errors: number;
  error_samples?: string[];
}

const CONFIRM_PHRASE = "i-have-set-the-master-key";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE) {
      return json(500, {
        error: "SUPABASE_SERVICE_ROLE_KEY not configured on this function",
      });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (body?.confirm !== CONFIRM_PHRASE) {
      return json(400, {
        error: `body must include { "confirm": "${CONFIRM_PHRASE}" }`,
      });
    }

    // Founder-email gate (a) OR admin-token gate (b). Either passes; both
    // failing = 403.
    const adminEmail =
      Deno.env.get("PHASE1_ADMIN_EMAIL") ?? DEFAULT_FOUNDER_EMAIL;
    const adminToken = Deno.env.get("BACKFILL_ADMIN_TOKEN");

    let gateAuthed = false;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (
        u?.user?.email &&
        u.user.email.toLowerCase() === adminEmail.toLowerCase()
      ) {
        gateAuthed = true;
      }
    }
    if (!gateAuthed && adminToken && body?.adminToken === adminToken) {
      gateAuthed = true;
    }
    if (!gateAuthed) {
      return json(403, { error: "admin gate failed" });
    }

    await _sodium.ready;
    const sodium = _sodium;
    const key = await loadMasterKey(sodium);

    // Service-role client bypasses RLS so we can iterate every user's rows.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── blood_results: encrypt rows where value_enc IS NULL ──────────────
    const bloodStats: BackfillStats = { encrypted: 0, skipped: 0, errors: 0, error_samples: [] };
    {
      const { data: rows, error } = await admin
        .from("blood_results")
        .select("id, value, unit, value_enc")
        .is("value_enc", null);
      if (error) {
        bloodStats.errors += 1;
        bloodStats.error_samples!.push(`select: ${error.message}`);
      } else {
        for (const row of rows ?? []) {
          try {
            // value is numeric|null in postgres; serialise to text for stability.
            const valueText =
              row.value == null ? "" : String(row.value);
            const unitText = row.unit == null ? "" : String(row.unit);
            const valueSealed = encryptToBytes(sodium, key, valueText);
            const unitSealed = encryptToBytes(sodium, key, unitText);
            const { error: upErr } = await admin
              .from("blood_results")
              .update({
                value_enc: valueSealed,
                unit_enc: unitSealed,
              })
              .eq("id", row.id);
            if (upErr) {
              bloodStats.errors += 1;
              if (bloodStats.error_samples!.length < 5) {
                bloodStats.error_samples!.push(
                  `update id=${row.id}: ${upErr.message}`,
                );
              }
            } else {
              bloodStats.encrypted += 1;
            }
          } catch (rowErr) {
            bloodStats.errors += 1;
            if (bloodStats.error_samples!.length < 5) {
              const m = rowErr instanceof Error ? rowErr.message : "unknown";
              bloodStats.error_samples!.push(`encrypt id=${row.id}: ${m}`);
            }
          }
        }
      }
      // Count how many rows were already encrypted (skipped).
      const { count: alreadyCount } = await admin
        .from("blood_results")
        .select("id", { count: "exact", head: true })
        .not("value_enc", "is", null);
      // skipped = total already-encrypted minus the ones we just encrypted.
      bloodStats.skipped = Math.max(
        0,
        (alreadyCount ?? 0) - bloodStats.encrypted,
      );
    }

    // ── user_medications: encrypt rows where name_enc IS NULL ────────────
    const medsStats: BackfillStats = { encrypted: 0, skipped: 0, errors: 0, error_samples: [] };
    {
      const { data: rows, error } = await admin
        .from("user_medications")
        .select("id, name, category, name_enc")
        .is("name_enc", null);
      if (error) {
        medsStats.errors += 1;
        medsStats.error_samples!.push(`select: ${error.message}`);
      } else {
        for (const row of rows ?? []) {
          try {
            const nameText = row.name == null ? "" : String(row.name);
            const categoryText =
              row.category == null ? "" : String(row.category);
            const nameSealed = encryptToBytes(sodium, key, nameText);
            const categorySealed = encryptToBytes(sodium, key, categoryText);
            const { error: upErr } = await admin
              .from("user_medications")
              .update({
                name_enc: nameSealed,
                category_enc: categorySealed,
              })
              .eq("id", row.id);
            if (upErr) {
              medsStats.errors += 1;
              if (medsStats.error_samples!.length < 5) {
                medsStats.error_samples!.push(
                  `update id=${row.id}: ${upErr.message}`,
                );
              }
            } else {
              medsStats.encrypted += 1;
            }
          } catch (rowErr) {
            medsStats.errors += 1;
            if (medsStats.error_samples!.length < 5) {
              const m = rowErr instanceof Error ? rowErr.message : "unknown";
              medsStats.error_samples!.push(`encrypt id=${row.id}: ${m}`);
            }
          }
        }
      }
      const { count: alreadyCount } = await admin
        .from("user_medications")
        .select("id", { count: "exact", head: true })
        .not("name_enc", "is", null);
      medsStats.skipped = Math.max(
        0,
        (alreadyCount ?? 0) - medsStats.encrypted,
      );
    }

    return json(200, {
      blood_results: bloodStats,
      user_medications: medsStats,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backfill failed";
    console.error("phase1-backfill-existing-rows failed:", msg);
    return json(500, { error: msg });
  }
});
