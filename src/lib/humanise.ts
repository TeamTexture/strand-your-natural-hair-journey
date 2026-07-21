/**
 * humanise.ts — turn stored enum-ish values and snake_case keys into readable prose.
 *
 * Nothing in the passport UI should render a raw DB value. Anything opaque
 * (snake_case, enum codes, booleans, arrays) must flow through here first.
 */

// ── Explicit label maps (curated) ────────────────────────────────────────

const HAIR_TYPE: Record<string, string> = {
  type_1a: "Type 1A", type_1b: "Type 1B", type_1c: "Type 1C",
  type_2a: "Type 2A", type_2b: "Type 2B", type_2c: "Type 2C",
  type_3a: "Type 3A", type_3b: "Type 3B", type_3c: "Type 3C",
  type_4a: "Type 4A", type_4b: "Type 4B", type_4c: "Type 4C",
};

const POROSITY: Record<string, string> = {
  low: "Low porosity", low_porosity: "Low porosity",
  medium: "Medium porosity", medium_porosity: "Medium porosity",
  normal_porosity: "Normal porosity",
  high: "High porosity", high_porosity: "High porosity",
};

const DENSITY: Record<string, string> = {
  low: "Low density", low_density: "Low density",
  medium: "Medium density", medium_density: "Medium density",
  high: "High density", high_density: "High density",
  fine: "Fine", medium_thick: "Medium/thick", thick: "Thick",
};

const BLOOD_STATUS: Record<string, string> = {
  low: "Low",
  high: "High",
  borderline: "Borderline",
  in_range: "In range",
  normal: "In range",
  untested: "Not tested",
  none: "In range",
};

const APPOINTMENT_STATUS: Record<string, string> = {
  scheduled: "Scheduled",
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  no_show: "No show",
};

const GOAL_STATUS: Record<string, string> = {
  active: "Active",
  achieved: "Achieved",
  paused: "Paused",
  dropped: "Dropped",
  future: "Future goal",
};

const MOOD: Record<string, string> = {
  amazing: "Amazing", great: "Great", good: "Good", okay: "Okay",
  low: "Low", stressed: "Stressed", frustrated: "Frustrated",
  tired: "Tired", proud: "Proud",
};

// Merged lookup: check this before generic snake_case → sentence.
const VALUE_MAP: Record<string, string> = {
  ...HAIR_TYPE,
  ...POROSITY,
  ...DENSITY,
  ...BLOOD_STATUS,
  ...APPOINTMENT_STATUS,
  ...GOAL_STATUS,
  ...MOOD,
  // Sundry codes seen across the app
  yes: "Yes", no: "No",
  male: "Male", female: "Female", other: "Other",
  none_of_the_above: "None of the above",
  prefer_not_to_say: "Prefer not to say",
};

// ── Snake_case key humanisation ─────────────────────────────────────────

const KEY_OVERRIDES: Record<string, string> = {
  gmc_number: "GMC number",
  iot_number: "IoT number",
  hrt: "HRT",
  ai_insight: "AI insight",
  ai_summary: "AI summary",
  postcode: "Postcode",
  dob: "Date of birth",
  bio: "Biography",
  url: "URL",
  ml: "ml",
};

/** Titlecase-ish rendering of a snake_case column/field key. */
export const humaniseKey = (key: string): string => {
  if (KEY_OVERRIDES[key]) return KEY_OVERRIDES[key];
  const cleaned = key
    .replace(/_(id|url|path|hash|enc|snapshot|voice_url|audio_path)$/i, "")
    .replace(/_/g, " ")
    .trim();
  if (!cleaned) return key.replace(/_/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

// ── Value humanisation ──────────────────────────────────────────────────

const looksLikeIso = (v: string) =>
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}|$)/.test(v);

/**
 * Turn a single stored value into readable text.
 * Returns null when the value is genuinely empty (so callers can hide the row).
 */
export const humaniseValue = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    const parts = v.map(humaniseValue).filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return null; // let caller render structured objects itself
  const s = String(v).trim();
  if (!s) return null;
  const key = s.toLowerCase();
  if (VALUE_MAP[key]) return VALUE_MAP[key];
  // Bare hair-type codes like "3c" or "4a"
  if (/^[1-4][a-c]$/i.test(s)) return `Type ${s.toUpperCase()}`;
  // ISO strings should not be humanised here — callers should route them through formatPassportDate
  if (looksLikeIso(s)) return s;
  // snake_case / kebab-case → sentence
  if (/[_-]/.test(s) && s.length < 60) {
    return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s;
};

/** Fallback tone for a scalar value — used to colour porosity/status chips. */
export const valueTone = (v: unknown): "good" | "warn" | "alert" | "neutral" => {
  const s = String(v ?? "").toLowerCase();
  if (!s) return "neutral";
  if (/in.?range|normal|healthy|calm|good|balanced|none|achieved/.test(s)) return "good";
  if (/borderline|watch|moderate|dry|tight|some|itch/.test(s)) return "warn";
  if (/^(low|high)$/.test(s) || /alert|excess|heavy|severe/.test(s)) return "alert";
  return "neutral";
};

// ── Field-level filter for raw record dumps ─────────────────────────────

const HIDDEN_SUFFIXES = ["_enc", "_hash", "_snapshot", "_url", "_path", "_id"];
const HIDDEN_KEYS = new Set([
  "id", "user_id", "created_at", "updated_at", "deleted_at",
  "avatar_url", "storage_path", "thumbnail_path",
  "hair_feel_voice_url", "colour_reaction_audio_path",
  "outcome_audio_path", "off_shelf_voice_url",
  "audio_url", "voice_url", "photo_paths",
  "steps", "product_ids", "heat_treatment", "styling",
  "colour_history", "chemical_history",
]);

/** Whether a raw DB field key should be omitted from a humanised dump. */
export const shouldHideField = (key: string, extra: string[] = []): boolean => {
  if (HIDDEN_KEYS.has(key)) return true;
  if (extra.includes(key)) return true;
  return HIDDEN_SUFFIXES.some((suf) => key.endsWith(suf));
};
