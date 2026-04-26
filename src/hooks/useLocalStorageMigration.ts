// One-shot localStorage → Postgres migration for the five Phase-1 clinical
// domains. Mounted once inside <RequireAuth> (idempotent on every mount via
// the `strand_migration_v1_done` flag). Per-domain skip when the DB row
// already exists, so the same legacy device opening on a fresh machine never
// overwrites remote data.
//
// Encrypted columns are routed through `data-encrypt-batch` first; we use the
// `ciphertext_pg_hex` form because the alternative `ciphertext_b64` is JSON-
// serialised by PostgREST as `{"0":n,...}` and silently corrupts the bytea
// column. (See the comment in supabase/functions/data-encrypt-batch/index.ts.)
//
// On success: writes `strand_migration_v1_done` with the current ISO timestamp.
// On failure: leaves the flag empty so the next session retries — partial
// successes are safe because each domain bails on a pre-existing DB row.
//
// See docs/PHASE_1_PLAN.md §4.

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invalidateClinicalContextCache } from "@/lib/clinicalContext";

const FLAG_KEY = "strand_migration_v1_done";

interface LegacyBasic {
  name?: string;
  age?: string | number;
  postcode?: string;
  country?: string;
  heritage?: string;
}
interface LegacyHair {
  diameter?: string[];
  texture?: string[];
  density?: string[];
  porosity?: string[];
  elasticity?: string[];
  scalp?: string[];
  diagnosed?: string[];
  areas?: string[];
}
interface LegacyHealth {
  lifeStage?: string[];
  contraception?: string[];
  conditions?: string[];
  diet?: string;
  dietBalance?: string[];
  smoke?: string[];
  alcohol?: string;
  water?: string[];
  exercise?: string[];
  sleep?: string[];
  medications?: string[];
}
interface LegacyStyle {
  current_hairstyle?: string;
  style_set_at?: string;
  planned_next_style?: string;
  howLong?: string;
  plans?: string[];
  changingTo?: string[];
  defaultStyle?: string[];
  colour?: string[];
  chemHist?: string[];
}
interface LegacyPro {
  name?: string;
  type?: string;
  gmc?: string;
  iot?: string;
  clinic?: string;
  date?: string;
  notes?: string;
  notesAudioPath?: string | null;
  instagram?: string;
  website?: string;
  bookingUrl?: string;
  pickedFromDirectory?: boolean;
}

function safeParse<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

interface EncryptItem { id: string; plaintext: string }

interface EncryptResponseItem {
  id: string;
  ciphertext_b64: string;
  ciphertext_pg_hex: string;
}

/** Encrypt a batch of plaintexts via the JWT-gated edge function. Returns the
 *  PostgREST-safe `\x...` hex string keyed by the input id. */
async function encryptBatch(items: EncryptItem[]): Promise<Record<string, string>> {
  if (items.length === 0) return {};
  const { data, error } = await supabase.functions.invoke("data-encrypt-batch", {
    body: { items },
  });
  if (error) throw new Error(`encrypt-batch failed: ${error.message}`);
  if (!data?.items) throw new Error("encrypt-batch returned no items");
  const out: Record<string, string> = {};
  for (const it of data.items as EncryptResponseItem[]) {
    if (typeof it.ciphertext_pg_hex !== "string") {
      throw new Error("encrypt-batch missing ciphertext_pg_hex");
    }
    out[it.id] = it.ciphertext_pg_hex;
  }
  return out;
}

// ─────────────────── Per-domain migrations ───────────────────

async function migrateProfilesIdentity(userId: string): Promise<void> {
  const basic = safeParse<LegacyBasic>("strand_profile_basic");
  const heritageArr = safeParse<string[]>("strand_heritage");
  if (!basic && (!heritageArr || heritageArr.length === 0)) return;

  const { data: existing } = await supabase
    .from("profiles")
    .select("postcode, country, heritage, birth_year")
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return;

  const update: {
    postcode?: string;
    country?: string;
    heritage?: string[];
    birth_year?: number;
  } = {};

  if (!existing.postcode && basic?.postcode) {
    update.postcode = basic.postcode.trim().toUpperCase();
  }
  if (basic?.country && !existing.country) {
    update.country = basic.country;
  }
  if (
    (!existing.heritage || existing.heritage.length === 0) &&
    Array.isArray(heritageArr) &&
    heritageArr.length > 0
  ) {
    update.heritage = heritageArr;
  }
  if (existing.birth_year == null && basic?.age != null && basic.age !== "") {
    const age =
      typeof basic.age === "number"
        ? basic.age
        : parseInt(String(basic.age), 10);
    if (Number.isFinite(age) && age >= 1 && age <= 120) {
      update.birth_year = new Date().getFullYear() - age;
    }
  }

  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("user_id", userId);
  if (error) throw new Error(`profiles update: ${error.message}`);
}

async function migrateHairProfile(userId: string): Promise<void> {
  const local = safeParse<LegacyHair>("strand_hair_profile");
  if (!local) return;

  const { data: existing } = await supabase
    .from("user_hair_profile")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const scalpStr = (local.scalp ?? [])[0] ?? "";
  const diagnosedArr = local.diagnosed ?? [];

  const enc = await encryptBatch([
    { id: "scalp", plaintext: scalpStr },
    { id: "diagnosed", plaintext: JSON.stringify(diagnosedArr) },
  ]);

  const { error } = await supabase.from("user_hair_profile").insert({
    user_id: userId,
    diameter: (local.diameter ?? [])[0] ?? null,
    surface_texture: (local.texture ?? [])[0] ?? null,
    density: (local.density ?? [])[0] ?? null,
    porosity: (local.porosity ?? [])[0] ?? null,
    elasticity: (local.elasticity ?? [])[0] ?? null,
    scalp_condition_enc: enc.scalp,
    diagnosed_conditions_enc: enc.diagnosed,
    areas_of_concern: local.areas ?? [],
  });
  if (error) throw new Error(`user_hair_profile insert: ${error.message}`);
}

async function migrateHealthProfile(userId: string): Promise<void> {
  const local = safeParse<LegacyHealth>("strand_health_profile");
  if (!local) return;

  const { data: existing } = await supabase
    .from("user_health_profile")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const enc = await encryptBatch([
    { id: "life_stage", plaintext: JSON.stringify(local.lifeStage ?? []) },
    { id: "contraception", plaintext: JSON.stringify(local.contraception ?? []) },
    { id: "medical_conditions", plaintext: JSON.stringify(local.conditions ?? []) },
  ]);

  const { error } = await supabase.from("user_health_profile").insert({
    user_id: userId,
    life_stage_enc: enc.life_stage,
    contraception_enc: enc.contraception,
    medical_conditions_enc: enc.medical_conditions,
    diet: local.diet ?? null,
    diet_balance: (local.dietBalance ?? [])[0] ?? null,
    smoke: (local.smoke ?? [])[0] ?? null,
    alcohol: local.alcohol ?? null,
    daily_water: (local.water ?? [])[0] ?? null,
    exercise: (local.exercise ?? [])[0] ?? null,
    sleep_quality: (local.sleep ?? [])[0] ?? null,
  });
  if (error) throw new Error(`user_health_profile insert: ${error.message}`);
}

async function migrateStyleProfile(userId: string): Promise<void> {
  const local = safeParse<LegacyStyle>("strand_current_style");
  if (!local) return;

  const { data: existing } = await supabase
    .from("user_style_profile")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("user_style_profile").insert({
    user_id: userId,
    current_colour_status: (local.colour ?? [])[0] ?? null,
    chemical_history: local.chemHist ?? [],
    current_hairstyle: local.current_hairstyle ?? null,
    style_set_at: local.style_set_at ?? null,
    planned_next_style: local.planned_next_style ?? null,
    planned_change_date: null,
    default_styles: local.defaultStyle ?? [],
  });
  if (error) throw new Error(`user_style_profile insert: ${error.message}`);
}

async function migrateProfessional(userId: string): Promise<void> {
  const local = safeParse<LegacyPro>("strand_professional");
  if (!local) return;

  const { data: existing } = await supabase
    .from("user_professionals")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const enc = await encryptBatch([
    { id: "gmc", plaintext: local.gmc ?? "" },
    { id: "iot", plaintext: local.iot ?? "" },
    { id: "notes", plaintext: local.notes ?? "" },
  ]);

  const { error } = await supabase.from("user_professionals").insert({
    user_id: userId,
    name: local.name ?? null,
    professional_type: local.type ?? null,
    clinic: local.clinic ?? null,
    consultation_date: local.date ? local.date : null,
    gmc_number_enc: enc.gmc,
    iot_number_enc: enc.iot,
    notes_enc: enc.notes,
    notes_audio_path: local.notesAudioPath ?? null,
    instagram_handle: local.instagram ?? null,
    website_url: local.website ?? null,
    booking_url: local.bookingUrl ?? null,
    picked_from_directory: !!local.pickedFromDirectory,
  });
  if (error) throw new Error(`user_professionals insert: ${error.message}`);
}

/** Run all five domain migrations in parallel. Resolves only when every
 *  domain succeeds; rejects on the first failure. */
export async function runMigrationV1(userId: string): Promise<void> {
  await Promise.all([
    migrateProfilesIdentity(userId),
    migrateHairProfile(userId),
    migrateHealthProfile(userId),
    migrateStyleProfile(userId),
    migrateProfessional(userId),
  ]);
}

/** Hook used inside <RequireAuth>. Runs the migration once per device per
 *  user, gated by a localStorage flag. Failures don't set the flag — the next
 *  authed render retries automatically. */
export function useLocalStorageMigration(): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(FLAG_KEY)) return;

    let cancelled = false;
    void (async () => {
      try {
        await runMigrationV1(user.id);
        if (cancelled) return;
        try {
          localStorage.setItem(FLAG_KEY, new Date().toISOString());
        } catch {
          /* private-mode browsers will throw; ignore */
        }
        invalidateClinicalContextCache();
      } catch (err) {
        // Don't toast — silent migration. Try again next session.
        console.error("[strand] localStorage migration v1 failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
