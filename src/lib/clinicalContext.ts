// Clinical-data loader: the single source of truth for hair / health / style /
// professional / profile-basic data on the client.
//
// Phase 1 ships these in Postgres (with bytea-encrypted columns for the
// clinical-sensitive fields), but legacy localStorage writes still happen too
// (dual-write window — see PHASE_1_PLAN.md §4 / §15). This module:
//   1. Reads from the new DB tables (`user_hair_profile`, `user_health_profile`,
//      `user_style_profile`, `user_professionals`, `profiles`) and the
//      `data-decrypt-context` edge function.
//   2. Falls back to legacy localStorage when a DB row is absent for the user.
//      Returning beta users who haven't yet triggered `useLocalStorageMigration`
//      still get a working clinical context.
//   3. Returns the LEGACY shape consumers already understand
//      (e.g. `hair.diameter: string[]`, `health.lifeStage: string[]`) so the 9
//      client files in §5 of the plan only need a one-line swap from
//      `safeParse(...)` to `await loadClinicalContext()`.
//
// `data-decrypt-context` is cached in-module for 30 s to keep multiple consumer
// reads in the same render to a single edge-function round-trip.

import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────── Types ───────────────────────────

export interface HairSlice {
  diameter: string[];
  texture: string[];
  density: string[];
  porosity: string[];
  elasticity: string[];
  scalp: string[];
  diagnosed: string[];
  areas: string[];
}

export interface HealthSlice {
  lifeStage: string[];
  contraception: string[];
  conditions: string[];
  diet: string;
  dietBalance: string[];
  smoke: string[];
  alcohol: string;
  water: string[];
  exercise: string[];
  sleep: string[];
  medications: string[];
}

export interface StyleSlice {
  current_hairstyle: string | null;
  style_set_at: string | null;
  planned_next_style: string | null;
  planned_change_date: string | null;
  default_styles: string[];
  colour: string[];
  chemical_history: string[];
  // Legacy localStorage fields kept for compatibility with code that reads
  // `style.howLong` / `style.plans` / `style.style` / `style.style_set_on`.
  howLong?: string;
  howLongNum?: string;
  howLongUnit?: string;
  plans?: string[];
  changingTo?: string[];
  defaultStyle?: string[];
  chemHist?: string[];
  style?: string[];
  style_set_on?: string | null;
  styleStartDate?: string | null;
}

export interface ProfessionalSlice {
  name: string | null;
  professional_type: string | null;
  clinic: string | null;
  consultation_date: string | null;
  notes: string | null;
  gmc_number: string | null;
  iot_number: string | null;
  notes_audio_path: string | null;
  instagram_handle: string | null;
  website_url: string | null;
  booking_url: string | null;
  picked_from_directory: boolean;
}

export interface ProfileBasicSlice {
  name: string | null;
  age: number | null;
  birth_year: number | null;
  postcode: string | null;
  country: string | null;
  heritage: string[];
}


export interface ClinicalContext {
  hair: HairSlice | null;
  health: HealthSlice | null;
  style: StyleSlice | null;
  professional: ProfessionalSlice | null;
  basic: ProfileBasicSlice | null;
}

interface DecryptedContext {
  hair: { scalp_condition: string | null; diagnosed_conditions: string[] } | null;
  health: {
    life_stage: string | null;
    contraception: string[];
    medical_conditions: string[];
  } | null;
  professional: {
    gmc_number: string | null;
    iot_number: string | null;
    notes: string | null;
  } | null;
  medications: Array<{ id: string; name: string; category: string | null }>;
  bloodResults: Array<{ id: string; value: number | null; unit: string | null }>;
}

// ─────────────────────────── Helpers ───────────────────────────

function safeParse<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const wrap = (v: string | null | undefined): string[] => (v ? [v] : []);

const ensureStringArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
};

// ─────────────────── Decrypted-context cache ───────────────────

let decryptCache: { promise: Promise<DecryptedContext | null>; at: number } | null = null;
const DECRYPT_TTL_MS = 30_000;

/** Drop the cached decrypted payload — call after writes that change encrypted
 *  columns so the next read sees fresh data. */
export function invalidateClinicalContextCache(): void {
  decryptCache = null;
}

async function fetchDecryptedContext(): Promise<DecryptedContext | null> {
  const now = Date.now();
  if (decryptCache && now - decryptCache.at < DECRYPT_TTL_MS) {
    return decryptCache.promise;
  }
  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "data-decrypt-context",
        { body: {} },
      );
      if (error) throw error;
      return (data as DecryptedContext | null) ?? null;
    } catch (err) {
      console.warn("[strand] data-decrypt-context failed", err);
      return null;
    }
  })();
  decryptCache = { promise, at: now };
  return promise;
}

// ─────────────────── Slice builders (local fallback) ───────────────────

interface LegacyHair {
  diameter?: unknown;
  texture?: unknown;
  density?: unknown;
  porosity?: unknown;
  elasticity?: unknown;
  scalp?: unknown;
  diagnosed?: unknown;
  areas?: unknown;
}
interface LegacyHealth {
  lifeStage?: unknown;
  contraception?: unknown;
  conditions?: unknown;
  diet?: unknown;
  dietBalance?: unknown;
  smoke?: unknown;
  alcohol?: unknown;
  water?: unknown;
  exercise?: unknown;
  sleep?: unknown;
  medications?: unknown;
}
interface LegacyStyle {
  current_hairstyle?: string;
  style_set_at?: string;
  style_set_on?: string;
  styleStartDate?: string;
  planned_next_style?: string;
  planned_change_date?: string;
  howLong?: string;
  howLongNum?: string;
  howLongUnit?: string;
  plans?: string[];
  changingTo?: string[];
  defaultStyle?: string[];
  colour?: string[];
  chemHist?: string[];
  style?: string[];
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
interface LegacyBasic {
  name?: string;
  age?: string | number;
  birth_year?: number | null;
  postcode?: string;
  country?: string;
  heritage?: string;
}

function hairFromLocal(): HairSlice | null {
  const raw = safeParse<LegacyHair | null>("strand_hair_profile", null);
  if (!raw) return null;
  return {
    diameter: ensureStringArray(raw.diameter),
    texture: ensureStringArray(raw.texture),
    density: ensureStringArray(raw.density),
    porosity: ensureStringArray(raw.porosity),
    elasticity: ensureStringArray(raw.elasticity),
    scalp: ensureStringArray(raw.scalp),
    diagnosed: ensureStringArray(raw.diagnosed),
    areas: ensureStringArray(raw.areas),
  };
}

function healthFromLocal(): HealthSlice | null {
  const raw = safeParse<LegacyHealth | null>("strand_health_profile", null);
  if (!raw) return null;
  return {
    lifeStage: ensureStringArray(raw.lifeStage),
    contraception: ensureStringArray(raw.contraception),
    conditions: ensureStringArray(raw.conditions),
    diet: typeof raw.diet === "string" ? raw.diet : "",
    dietBalance: ensureStringArray(raw.dietBalance),
    smoke: ensureStringArray(raw.smoke),
    alcohol: typeof raw.alcohol === "string" ? raw.alcohol : "",
    water: ensureStringArray(raw.water),
    exercise: ensureStringArray(raw.exercise),
    sleep: ensureStringArray(raw.sleep),
    medications: ensureStringArray(raw.medications),
  };
}

function styleFromLocal(): StyleSlice | null {
  const raw = safeParse<LegacyStyle | null>("strand_current_style", null);
  if (!raw) return null;
  return {
    current_hairstyle: raw.current_hairstyle ?? null,
    style_set_at: raw.style_set_at ?? raw.style_set_on ?? raw.styleStartDate ?? null,
    style_set_on: raw.style_set_on ?? raw.style_set_at ?? null,
    styleStartDate: raw.styleStartDate ?? raw.style_set_at ?? null,
    planned_next_style: raw.planned_next_style ?? null,
    planned_change_date: raw.planned_change_date ?? null,
    default_styles: raw.defaultStyle ?? [],
    defaultStyle: raw.defaultStyle ?? [],
    colour: raw.colour ?? [],
    chemical_history: raw.chemHist ?? [],
    chemHist: raw.chemHist ?? [],
    howLong: raw.howLong,
    howLongNum: raw.howLongNum,
    howLongUnit: raw.howLongUnit,
    plans: raw.plans,
    changingTo: raw.changingTo,
    style: raw.style,
  };
}

function professionalFromLocal(): ProfessionalSlice | null {
  const raw = safeParse<LegacyPro | null>("strand_professional", null);
  if (!raw) return null;
  return {
    name: raw.name ?? null,
    professional_type: raw.type ?? null,
    clinic: raw.clinic ?? null,
    consultation_date: raw.date ?? null,
    notes: raw.notes ?? null,
    gmc_number: raw.gmc ?? null,
    iot_number: raw.iot ?? null,
    notes_audio_path: raw.notesAudioPath ?? null,
    instagram_handle: raw.instagram ?? null,
    website_url: raw.website ?? null,
    booking_url: raw.bookingUrl ?? null,
    picked_from_directory: !!raw.pickedFromDirectory,
  };
}

function basicFromLocal(): ProfileBasicSlice | null {
  const raw = safeParse<LegacyBasic | null>("strand_profile_basic", null);
  const heritageArr = safeParse<string[]>("strand_heritage", []);
  if (!raw && (!heritageArr || heritageArr.length === 0)) return null;
  const cachedBirthYear =
    raw?.birth_year != null && Number.isFinite(Number(raw.birth_year))
      ? Number(raw.birth_year)
      : null;
  const ageFromBirthYear =
    cachedBirthYear != null ? new Date().getFullYear() - cachedBirthYear : null;
  const ageFromRaw =
    raw?.age != null && raw.age !== ""
      ? typeof raw.age === "number"
        ? raw.age
        : parseInt(String(raw.age), 10)
      : null;
  // Prefer birth_year-derived age so it ticks up automatically each year.
  const ageNum = ageFromBirthYear ?? ageFromRaw;
  return {
    name: raw?.name ?? null,
    age: Number.isFinite(ageNum) ? (ageNum as number) : null,
    birth_year: cachedBirthYear,
    postcode: raw?.postcode ?? null,
    country: raw?.country ?? null,
    heritage: heritageArr.length > 0 ? heritageArr : raw?.heritage ? [raw.heritage] : [],
  };
}


// ─────────────────── Encrypt helper (write side) ───────────────────

interface EncryptItem {
  id: string;
  plaintext: string;
}

interface EncryptResponseItem {
  id: string;
  ciphertext_b64: string;
  ciphertext_pg_hex: string;
}

/**
 * Encrypt a batch of plaintexts via the JWT-gated `data-encrypt-batch` edge
 * function. Returns the PostgREST-safe `\x...` hex string keyed by the input
 * id — that's the only wire format that PostgREST decodes into the bytea
 * column correctly. (See data-encrypt-batch/index.ts for the bug class.)
 */
export async function encryptForStorage(
  items: EncryptItem[],
): Promise<Record<string, string>> {
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

/**
 * Synchronous local-only snapshot — used as React Query `initialData` so the
 * Profile screen renders instantly from cached localStorage while the DB
 * overlay loads in the background. Safe on SSR (returns all-null slices).
 */
export function loadClinicalContextLocal(): ClinicalContext {
  return {
    hair: hairFromLocal(),
    health: healthFromLocal(),
    style: styleFromLocal(),
    professional: professionalFromLocal(),
    basic: basicFromLocal(),
  };
}


// ─────────────────── Public loader ───────────────────

/**
 * Load the user's clinical context. Each slice is sourced from the new DB
 * table when a row exists; otherwise it falls back to legacy localStorage.
 *
 * Encrypted fields are decrypted via the `data-decrypt-context` edge function
 * (cached for 30 seconds in-module).
 *
 * Returns nullable slices: `null` means we have no data on either side and the
 * caller should render its empty state.
 *
 * @param opts.allowLocalFallback when false, the legacy `strand_*`
 *   localStorage payload on this device is ignored entirely. Used by callers
 *   (notably `buildAiContext`) to prevent cross-account leaks on shared
 *   browsers where a previous user wrote `strand_*` keys that the current
 *   `auth.uid()` did not. Defaults to `true` for backwards compatibility with
 *   any caller that doesn't yet know the current uid.
 */
export async function loadClinicalContext(
  opts: { allowLocalFallback?: boolean } = {},
): Promise<ClinicalContext> {
  const allowLocalFallback = opts.allowLocalFallback !== false;

  // Always start with the localStorage fallback so unauthenticated/SSR paths
  // still return something coherent — UNLESS the caller has told us the
  // local payload doesn't belong to the current user.
  const ctx: ClinicalContext = {
    hair: allowLocalFallback ? hairFromLocal() : null,
    health: allowLocalFallback ? healthFromLocal() : null,
    style: allowLocalFallback ? styleFromLocal() : null,
    professional: allowLocalFallback ? professionalFromLocal() : null,
    basic: allowLocalFallback ? basicFromLocal() : null,
  };

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    return ctx;
  }
  if (!userId) return ctx;

  try {
    const [profileRes, hairRes, healthRes, styleRes, proRes, decrypted, medsRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, postcode, country, heritage, birth_year")
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("user_hair_profile")
          .select(
            "diameter, surface_texture, density, porosity, elasticity, areas_of_concern",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_health_profile")
          .select(
            "diet, diet_balance, smoke, alcohol, daily_water, exercise, sleep_quality",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_style_profile")
          .select(
            "current_colour_status, chemical_history, current_hairstyle, style_set_at, planned_next_style, planned_change_date, default_styles",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_professionals")
          .select(
            "name, professional_type, clinic, consultation_date, notes_audio_path, instagram_handle, website_url, booking_url, picked_from_directory",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        fetchDecryptedContext(),
        supabase
          .from("user_medications")
          .select("name, category")
          .eq("user_id", userId),
      ]);

    // ── basic (profiles) — overlay onto local fallback ──
    const profileRow = profileRes.data;
    if (profileRow) {
      const heritage = profileRow.heritage ?? [];
      const birthYear = profileRow.birth_year ?? null;
      const derivedAge = birthYear ? new Date().getFullYear() - birthYear : null;
      ctx.basic = {
        name: profileRow.display_name ?? ctx.basic?.name ?? null,
        age: derivedAge ?? ctx.basic?.age ?? null,
        birth_year: birthYear,
        postcode: profileRow.postcode ?? ctx.basic?.postcode ?? null,
        country: profileRow.country ?? ctx.basic?.country ?? null,
        heritage:
          heritage.length > 0 ? heritage : (ctx.basic?.heritage ?? []),
      };
    }

    // ── hair ──
    const hairRow = hairRes.data;
    if (hairRow) {
      ctx.hair = {
        diameter: wrap(hairRow.diameter),
        texture: wrap(hairRow.surface_texture),
        density: wrap(hairRow.density),
        porosity: wrap(hairRow.porosity),
        elasticity: wrap(hairRow.elasticity),
        scalp: wrap(decrypted?.hair?.scalp_condition ?? null),
        diagnosed: decrypted?.hair?.diagnosed_conditions ?? [],
        areas: hairRow.areas_of_concern ?? [],
      };
    }

    // ── health ──
    const healthRow = healthRes.data;
    const meds = (medsRes.data ?? []).map((m) => m.name).filter(Boolean);
    if (healthRow) {
      ctx.health = {
        lifeStage: wrap(decrypted?.health?.life_stage ?? null),
        contraception: decrypted?.health?.contraception ?? [],
        conditions: decrypted?.health?.medical_conditions ?? [],
        diet: healthRow.diet ?? "",
        dietBalance: wrap(healthRow.diet_balance),
        smoke: wrap(healthRow.smoke),
        alcohol: healthRow.alcohol ?? "",
        water: wrap(healthRow.daily_water),
        exercise: wrap(healthRow.exercise),
        sleep: wrap(healthRow.sleep_quality),
        medications: meds,
      };
    } else if (ctx.health) {
      // localStorage fallback path: still merge live meds.
      ctx.health = { ...ctx.health, medications: meds.length > 0 ? meds : ctx.health.medications };
    } else if (meds.length > 0) {
      // No localStorage health, but the user has meds in DB — surface those.
      ctx.health = {
        lifeStage: [],
        contraception: [],
        conditions: [],
        diet: "",
        dietBalance: [],
        smoke: [],
        alcohol: "",
        water: [],
        exercise: [],
        sleep: [],
        medications: meds,
      };
    }

    // ── style ──
    const styleRow = styleRes.data;
    if (styleRow) {
      ctx.style = {
        current_hairstyle: styleRow.current_hairstyle ?? null,
        style_set_at: styleRow.style_set_at ?? null,
        style_set_on: styleRow.style_set_at ?? null,
        styleStartDate: styleRow.style_set_at ?? null,
        planned_next_style: styleRow.planned_next_style ?? null,
        planned_change_date: styleRow.planned_change_date ?? null,
        default_styles: styleRow.default_styles ?? [],
        defaultStyle: styleRow.default_styles ?? [],
        colour: styleRow.current_colour_status ? [styleRow.current_colour_status] : [],
        chemical_history: styleRow.chemical_history ?? [],
        chemHist: styleRow.chemical_history ?? [],
        style: styleRow.current_hairstyle ? [styleRow.current_hairstyle] : [],
      };
    }

    // ── professional ──
    const proRow = proRes.data;
    if (proRow) {
      ctx.professional = {
        name: proRow.name ?? null,
        professional_type: proRow.professional_type ?? null,
        clinic: proRow.clinic ?? null,
        consultation_date: proRow.consultation_date ?? null,
        notes: decrypted?.professional?.notes ?? null,
        gmc_number: decrypted?.professional?.gmc_number ?? null,
        iot_number: decrypted?.professional?.iot_number ?? null,
        notes_audio_path: proRow.notes_audio_path ?? null,
        instagram_handle: proRow.instagram_handle ?? null,
        website_url: proRow.website_url ?? null,
        booking_url: proRow.booking_url ?? null,
        picked_from_directory: proRow.picked_from_directory,
      };
    }
  } catch (err) {
    console.warn("[strand] loadClinicalContext partial failure", err);
  }

  return ctx;
}
