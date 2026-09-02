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
import { getDisplayedAuthUser, isViewingAsUser } from "@/lib/displayedUser";

// ─────────────────────────── Types ───────────────────────────

export interface HairSlice {
  /** Which pattern the member says her hair most closely matches, in words
   *  only ("Straight" | "Wavy" | "Curly" | "Coily (Afro-textured)"). Never
   *  expressed or reasoned about as a letter/number classification. */
  curl_pattern: string | null;
  diameter: string[];
  texture: string[];
  density: string[];
  porosity: string[];
  elasticity: string[];
  scalp: string[];
  diagnosed: string[];
  areas: string[];
  length_inches: number | null;
  length_bucket: string | null;
}

export interface HealthSlice {
  lifeStage: string[];
  contraception: string[];
  conditions: string[];
  diet: string;
  /** Free text: what an "Other" member avoids. Empty unless diet === "other". */
  dietOther: string;
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
  /** Style attributes — null until the user next edits their style. */
  current_style_tension?: string | null;
  current_style_extensions?: boolean | null;
  planned_style_tension?: string | null;
  planned_style_extensions?: boolean | null;
  planned_change_date: string | null;
  default_styles: string[];
  colour: string[];
  chemical_history: string[];
  // ── Colour history ──
  colour_type?: string | null;
  colour_product?: string | null;
  colour_last_treated?: string | null;
  colour_reaction?: boolean | null;
  colour_reaction_details?: string | null;
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
  water_hardness_band: string | null;
  water_hardness_mg_l: number | null;
  water_supplier: string | null;
}


/**
 * Did the encrypted slice actually load?
 *   "ok"     — the decrypt call succeeded. Empty fields mean genuinely unrecorded.
 *   "failed" — the decrypt call errored (see `data-decrypt-context`, which 5xxs
 *              deliberately). The encrypted fields below carry NO information and
 *              must not be read as "she recorded nothing".
 */
export type DecryptStatus = "ok" | "failed";

/** The context fields sourced from the encrypted decrypt payload. */
export const DECRYPT_BACKED_FIELDS = [
  "hair.scalp",
  "hair.diagnosed",
  "health.lifeStage",
  "health.contraception",
  "health.conditions",
  "professional.notes",
  "professional.gmc_number",
  "professional.iot_number",
] as const;

export interface ClinicalContext {
  hair: HairSlice | null;
  health: HealthSlice | null;
  style: StyleSlice | null;
  professional: ProfessionalSlice | null;
  basic: ProfileBasicSlice | null;
  /**
   * 2026-09-02 BUG FIX. The client used to swallow a decrypt 500 into `null`,
   * which then rendered scalp condition / diagnosed conditions / life stage /
   * contraception / medical conditions / professional notes as empty — silently
   * corrupting AI scoring with a half-profile. Callers MUST check this before
   * treating an empty encrypted field as an answer.
   */
  decryptStatus: DecryptStatus;
  /** Which fields hold no information because the decrypt failed. */
  decryptFailedFields: string[];
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
  sensitivities?: {
    topical?: unknown[] | null;
    dietary?: unknown[] | null;
  } | null;
}

// ─────────────────────────── Helpers ───────────────────────────

function safeParse<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  // A cached value may only be read for the user it belongs to. While an admin
  // is viewing the app as a member, this cache holds the ADMIN's clinical data
  // — reading it would render the admin's style/hair/health under the member's
  // name (the "Afro Mohawk on Jem's Home card" bug).
  if (isViewingAsUser()) return fallback;
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

/**
 * A decrypt read is one of exactly two things, and they are NOT the same thing:
 *   { ok: true,  data }  — the call succeeded. `data === null` means no rows.
 *   { ok: false, error } — the call failed. We know NOTHING about her data.
 * Collapsing the second into `null` is the bug this type exists to prevent.
 */
export type DecryptResult =
  | { ok: true; data: DecryptedContext | null }
  | { ok: false; error: Error };

let decryptCache: { promise: Promise<DecryptResult>; at: number } | null = null;
const DECRYPT_TTL_MS = 30_000;

/** Drop the cached decrypted payload — call after writes that change encrypted
 *  columns so the next read sees fresh data. */
export function invalidateClinicalContextCache(): void {
  decryptCache = null;
  contextCache.clear();
}

// ─────────────────── Whole-context cache ───────────────────
// Home mounts several consumers (alerts, guidance card, AI context builders)
// that each used to run the same 7-table fetch. Cache the built context
// briefly, keyed by the fallback flag, and share in-flight loads.
const CONTEXT_TTL_MS = 30_000;
const contextCache = new Map<string, { at: number; promise: Promise<ClinicalContext> }>();

/**
 * Shared, 30s-deduped read of the whole decrypted payload. Every consumer
 * (clinical context, sensitivities) goes through this so a page load costs at
 * most ONE `data-decrypt-context` invocation, not one per hook.
 *
 * THROWS when the decrypt call failed. A `null` return means "the call
 * succeeded and there is nothing recorded" — the two are never conflated.
 */
export async function loadDecryptedContext(): Promise<DecryptedContext | null> {
  const res = await fetchDecryptedContext();
  if ("error" in res) throw res.error;
  return res.data;
}



/** Result-shaped read: never throws, always says which of the two states it is. */
export async function loadDecryptedContextResult(): Promise<DecryptResult> {
  return fetchDecryptedContext();
}

async function fetchDecryptedContext(): Promise<DecryptResult> {
  const now = Date.now();
  if (decryptCache && now - decryptCache.at < DECRYPT_TTL_MS) {
    return decryptCache.promise;
  }
  const attempt = async (): Promise<DecryptedContext | null> => {
    const { data, error } = await supabase.functions.invoke(
      "data-decrypt-context",
      { body: {} },
    );
    if (error) throw error;
    return (data as DecryptedContext | null) ?? null;
  };
  const promise = (async (): Promise<DecryptResult> => {
    try {
      return { ok: true, data: await attempt() };
    } catch (first) {
      // One retry: a timeout or a transient rate limit must not be reported as
      // "she has no clinical data".
      try {
        return { ok: true, data: await attempt() };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(
          "[strand] data-decrypt-context failed twice — encrypted fields are UNKNOWN, not empty",
          { first, error },
        );
        // A failed read is never cached: the next consumer should try again.
        decryptCache = null;
        return { ok: false, error };
      }
    }
  })();
  decryptCache = { promise, at: now };
  return promise;
}


// ─────────────────── Slice builders (local fallback) ───────────────────

interface LegacyHair {
  curl_pattern?: unknown;
  diameter?: unknown;
  texture?: unknown;
  density?: unknown;
  porosity?: unknown;
  elasticity?: unknown;
  scalp?: unknown;
  diagnosed?: unknown;
  areas?: unknown;
  length_inches?: unknown;
  length_bucket?: unknown;
}
interface LegacyHealth {
  lifeStage?: unknown;
  contraception?: unknown;
  conditions?: unknown;
  diet?: unknown;
  dietOther?: unknown;
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
  current_style_tension?: string | null;
  current_style_extensions?: boolean | null;
  planned_style_tension?: string | null;
  planned_style_extensions?: boolean | null;
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
  const inchesNum = Number(raw.length_inches);
  return {
    curl_pattern: typeof raw.curl_pattern === "string" && raw.curl_pattern ? raw.curl_pattern : null,
    diameter: ensureStringArray(raw.diameter),
    texture: ensureStringArray(raw.texture),
    density: ensureStringArray(raw.density),
    porosity: ensureStringArray(raw.porosity),
    elasticity: ensureStringArray(raw.elasticity),
    scalp: ensureStringArray(raw.scalp),
    diagnosed: ensureStringArray(raw.diagnosed),
    areas: ensureStringArray(raw.areas),
    length_inches: Number.isFinite(inchesNum) && inchesNum > 0 ? inchesNum : null,
    length_bucket: typeof raw.length_bucket === "string" && raw.length_bucket ? raw.length_bucket : null,
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
    dietOther: typeof raw.dietOther === "string" ? raw.dietOther : "",
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
    current_style_tension: raw.current_style_tension ?? null,
    current_style_extensions: raw.current_style_extensions ?? null,
    planned_style_tension: raw.planned_style_tension ?? null,
    planned_style_extensions: raw.planned_style_extensions ?? null,
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
    water_hardness_band: null,
    water_hardness_mg_l: null,
    water_supplier: null,
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
    decryptStatus: "ok",
    decryptFailedFields: [],
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
  const key = opts.allowLocalFallback === false ? "no-local" : "local";
  const hit = contextCache.get(key);
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.promise;
  const promise = loadClinicalContextUncached(opts).catch((e) => {
    contextCache.delete(key);
    throw e;
  });
  contextCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function loadClinicalContextUncached(
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
    decryptStatus: "ok",
    decryptFailedFields: [],
  };


  let userId: string | null = null;
  try {
    const { data } = await getDisplayedAuthUser();
    userId = data.user?.id ?? null;
  } catch {
    return ctx;
  }
  if (!userId) return ctx;

  try {
    const [profileRes, hairRes, healthRes, styleRes, proRes, decryptRes, medsRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, postcode, country, heritage, birth_year")
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("user_hair_profile")
          .select(
            "curl_pattern, diameter, surface_texture, density, porosity, elasticity, areas_of_concern, length_inches, length_bucket",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_health_profile")
          .select(
            "diet, diet_other, diet_balance, smoke, alcohol, daily_water, exercise, sleep_quality",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_style_profile")
          .select(
            "current_colour_status, chemical_history, current_hairstyle, style_set_at, planned_next_style, planned_change_date, default_styles, colour_type, colour_product, colour_last_treated, colour_reaction, colour_reaction_details, current_style_tension, current_style_extensions, planned_style_tension, planned_style_extensions",
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

    // DECRYPT FAILURE IS NOT "NO DATA" (2026-09-02). When the call failed we
    // keep whatever the local fallback held and flag the fields as unknown —
    // never overwrite them with an empty array/null that reads as an answer.
    const decryptOk = decryptRes.ok;
    const decrypted = decryptRes.ok ? decryptRes.data : null;
    if (!decryptOk) {
      ctx.decryptStatus = "failed";
      ctx.decryptFailedFields = [...DECRYPT_BACKED_FIELDS];
    }
    const encArr = (local: string[] | undefined, dec: string[] | undefined | null): string[] =>
      decryptOk ? (dec ?? []) : (local ?? []);
    const encStr = (
      local: string | null | undefined,
      dec: string | null | undefined,
    ): string | null => (decryptOk ? (dec ?? null) : (local ?? null));



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
        water_hardness_band:
          (profileRow as { water_hardness_band?: string | null }).water_hardness_band ??
          ctx.basic?.water_hardness_band ?? null,
        water_hardness_mg_l:
          (profileRow as { water_hardness_mg_l?: number | null }).water_hardness_mg_l ??
          ctx.basic?.water_hardness_mg_l ?? null,
        water_supplier:
          (profileRow as { water_supplier?: string | null }).water_supplier ??
          ctx.basic?.water_supplier ?? null,
      };
    }

    // ── hair ──
    const hairRow = hairRes.data;
    if (hairRow) {
      const hairRowAny = hairRow as Record<string, unknown>;
      const li = Number(hairRowAny.length_inches);
      ctx.hair = {
        curl_pattern:
          typeof hairRowAny.curl_pattern === "string" && hairRowAny.curl_pattern
            ? (hairRowAny.curl_pattern as string)
            : (ctx.hair?.curl_pattern ?? null),
        diameter: wrap(hairRow.diameter),
        texture: wrap(hairRow.surface_texture),
        density: wrap(hairRow.density),
        porosity: wrap(hairRow.porosity),
        elasticity: wrap(hairRow.elasticity),
        scalp: encArr(ctx.hair?.scalp, wrap(decrypted?.hair?.scalp_condition ?? null)),
        diagnosed: encArr(ctx.hair?.diagnosed, decrypted?.hair?.diagnosed_conditions),

        areas: hairRow.areas_of_concern ?? [],
        length_inches: Number.isFinite(li) && li > 0 ? li : null,
        length_bucket: typeof hairRowAny.length_bucket === "string" && hairRowAny.length_bucket ? (hairRowAny.length_bucket as string) : null,
      };
    }

    // ── health ──
    const healthRow = healthRes.data;
    const meds = (medsRes.data ?? []).map((m) => m.name).filter(Boolean);
    if (healthRow) {
      ctx.health = {
        lifeStage: encArr(ctx.health?.lifeStage, wrap(decrypted?.health?.life_stage ?? null)),
        contraception: encArr(ctx.health?.contraception, decrypted?.health?.contraception),
        conditions: encArr(ctx.health?.conditions, decrypted?.health?.medical_conditions),

        diet: healthRow.diet ?? "",
        dietOther: healthRow.diet_other ?? "",
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
        dietOther: "",
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
        current_style_tension: styleRow.current_style_tension ?? null,
        current_style_extensions: styleRow.current_style_extensions ?? null,
        planned_style_tension: styleRow.planned_style_tension ?? null,
        planned_style_extensions: styleRow.planned_style_extensions ?? null,
        default_styles: styleRow.default_styles ?? [],
        defaultStyle: styleRow.default_styles ?? [],
        colour: styleRow.current_colour_status ? [styleRow.current_colour_status] : [],
        chemical_history: styleRow.chemical_history ?? [],
        chemHist: styleRow.chemical_history ?? [],
        style: styleRow.current_hairstyle ? [styleRow.current_hairstyle] : [],
        colour_type: (styleRow as { colour_type?: string | null }).colour_type ?? null,
        colour_product: (styleRow as { colour_product?: string | null }).colour_product ?? null,
        colour_last_treated: (styleRow as { colour_last_treated?: string | null }).colour_last_treated ?? null,
        colour_reaction: (styleRow as { colour_reaction?: boolean | null }).colour_reaction ?? null,
        colour_reaction_details: (styleRow as { colour_reaction_details?: string | null }).colour_reaction_details ?? null,
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
        notes: encStr(ctx.professional?.notes, decrypted?.professional?.notes),
        gmc_number: encStr(ctx.professional?.gmc_number, decrypted?.professional?.gmc_number),
        iot_number: encStr(ctx.professional?.iot_number, decrypted?.professional?.iot_number),

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
