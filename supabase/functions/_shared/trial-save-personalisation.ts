// TRIAL SAVE FLOW — personalisation picker (2026-09-08).
//
// Two save screens can appear when a member on the initial free trial starts to
// cancel. Each screen may show ONE fact she gave us, plus ONE next action based
// on what she has actually logged. This module is the single place that decides
// which fact and which action, so the two screens can never show the same fact
// and no screen can ever surface a null value.
//
// Everything here is pure apart from `loadTrialSaveSignals`, which reads her own
// rows. Nothing decrypted is ever logged.

export type TrialFactCategory = "porosity_scalp" | "areas_of_concern" | "curl_pattern";
export type TrialSaveAction = "log_wash_day" | "scan_product" | null;

export interface TrialSaveSignals {
  porosity: string | null;
  /** Decrypted scalp condition. Never logged. */
  scalpCondition: string | null;
  areasOfConcern: string[];
  curlPattern: string | null;
  washDayCount: number;
  productScanCount: number;
}

export interface TrialSavePersonalisation {
  /** Which fact was used, so the second screen can exclude it. */
  category: TrialFactCategory | null;
  /** "You told us …" — already humanised, never a raw enum or a null. */
  factLine: string | null;
  /** One sentence after the fact. */
  reasonLine: string | null;
  action: TrialSaveAction;
  /** True when she has logged nothing at all — the fallback card is shown. */
  noActivity: boolean;
}

/**
 * Encrypted clinical fields are stored as JSON, sometimes double-encoded
 * (`"[\"normal\"]"`), so a raw decrypt can read `["[\"normal\"]"]`. Unwrap to the
 * first real word — a member must never see brackets or quotes.
 */
export function unwrapStored(value: string | null | undefined): string | null {
  let current: unknown = value;
  for (let i = 0; i < 4; i += 1) {
    if (Array.isArray(current)) {
      current = current.find((v) => typeof v === "string" && v.trim()) ?? null;
      continue;
    }
    if (typeof current !== "string") break;
    const trimmed = current.trim();
    if (!trimmed) return null;
    if (!/^[[{"]/.test(trimmed)) return trimmed;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return trimmed.replace(/^[["'\s]+|[\]"'\s]+$/g, "") || null;
    }
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

/** Turn a stored value into something a member would recognise. */
export function humanise(value: string): string {
  const unwrapped = unwrapStored(value);
  const trimmed = (unwrapped ?? "").trim();
  if (!trimmed) return "";
  // "type_4c" → "Type 4C"; "high" → "high"; "Itchy or sensitive" is left alone.
  if (/^type[_\s-]?\d/i.test(trimmed)) {
    const m = trimmed.match(/^type[_\s-]?(\d)([a-z])?$/i);
    if (m) return `Type ${m[1]}${(m[2] ?? "").toUpperCase()}`;
  }
  return trimmed.replace(/_/g, " ");
}

function listWords(items: string[]): string {
  const clean = items.map(humanise).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0].toLowerCase();
  if (clean.length === 2) return `${clean[0].toLowerCase()} and ${clean[1].toLowerCase()}`;
  return `${clean.slice(0, -1).map((c) => c.toLowerCase()).join(", ")} and ${clean[clean.length - 1].toLowerCase()}`;
}

/** A value only counts when it is a real answer — never "Not sure", never null. */
function usable(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = (unwrapStored(value) ?? "").toLowerCase();
  return v.length > 0 && v !== "not sure" && v !== "unknown";
}

function factFor(
  category: TrialFactCategory,
  s: TrialSaveSignals,
): { factLine: string; category: TrialFactCategory } | null {
  if (category === "porosity_scalp") {
    if (!usable(s.porosity) || !usable(s.scalpCondition)) return null;
    return {
      category,
      factLine: `You told us your hair is ${humanise(s.porosity!).toLowerCase()} porosity and your scalp feels ${humanise(
        s.scalpCondition!,
      ).toLowerCase()}.`,
    };
  }
  if (category === "areas_of_concern") {
    const areas = s.areasOfConcern.filter((a) => usable(a));
    if (areas.length === 0) return null;
    return { category, factLine: `You flagged ${listWords(areas)}.` };
  }
  if (!usable(s.curlPattern)) return null;
  return { category, factLine: `You told us your curl pattern is ${humanise(s.curlPattern!)}.` };
}

/** Screen 1 priority: porosity + scalp > areas of concern > curl pattern. */
export const SCREEN_ONE_PRIORITY: TrialFactCategory[] = [
  "porosity_scalp",
  "areas_of_concern",
  "curl_pattern",
];

/** Screen 2 priority, with whatever screen 1 used excluded. */
export const SCREEN_TWO_PRIORITY: TrialFactCategory[] = [
  "areas_of_concern",
  "curl_pattern",
  "porosity_scalp",
];

const REASON_ONE: Record<TrialFactCategory, string> = {
  porosity_scalp:
    "A week is long enough to see how your hair behaves between washes, which is where that pairing shows itself.",
  areas_of_concern:
    "Those areas change slowly, so another week of logging gives us something real to work from.",
  curl_pattern:
    "Another week of wash days is what turns your pattern into guidance built around it.",
};

const REASON_TWO: Record<TrialFactCategory, string> = {
  porosity_scalp:
    "Three months is long enough for how your hair holds water and how your scalp feels to actually shift — a few days never is.",
  areas_of_concern:
    "Areas like that answer over months, not days, so three months is what shows you whether anything is moving.",
  curl_pattern:
    "Three months of logged wash days is what shows your pattern responding — a few days can't.",
};

/**
 * Pick the fact + action for one screen. `exclude` is the category the earlier
 * screen already used.
 */
export function chooseTrialSavePersonalisation(
  signals: TrialSaveSignals,
  opts: { screen: 1 | 2; exclude?: TrialFactCategory | null } = { screen: 1 },
): TrialSavePersonalisation {
  const hasActivity = signals.washDayCount > 0 || signals.productScanCount > 0;
  const action: TrialSaveAction = signals.washDayCount === 0
    ? "log_wash_day"
    : signals.productScanCount === 0
      ? "scan_product"
      : null;

  // No logged activity at all → the fallback card, regardless of how complete
  // her profile is.
  if (!hasActivity) {
    return { category: null, factLine: null, reasonLine: null, action: "log_wash_day", noActivity: true };
  }

  const order = opts.screen === 2 ? SCREEN_TWO_PRIORITY : SCREEN_ONE_PRIORITY;
  for (const category of order) {
    if (opts.exclude && category === opts.exclude) continue;
    const found = factFor(category, signals);
    if (found) {
      return {
        category: found.category,
        factLine: found.factLine,
        reasonLine: opts.screen === 2 ? REASON_TWO[category] : REASON_ONE[category],
        action,
        noActivity: false,
      };
    }
  }

  // She has logged something but holds no usable fact — show the tip without a
  // fact rather than inventing one.
  return { category: null, factLine: null, reasonLine: null, action, noActivity: false };
}

interface MinimalClient {
  from: (t: string) => any;
}

/**
 * Read her plaintext hair columns, decrypt the scalp condition, and count what
 * she has logged. Never throws — a missing signal simply reduces the
 * personalisation, it never fails the save screen.
 */
export async function loadTrialSaveSignals(
  admin: MinimalClient,
  userId: string,
  decryptScalp: (field: unknown) => Promise<string | null> | string | null,
): Promise<TrialSaveSignals> {
  const empty: TrialSaveSignals = {
    porosity: null,
    scalpCondition: null,
    areasOfConcern: [],
    curlPattern: null,
    washDayCount: 0,
    productScanCount: 0,
  };
  try {
    const [hairRes, washRes, prodRes] = await Promise.all([
      admin
        .from("user_hair_profile")
        .select("porosity, curl_pattern, areas_of_concern, scalp_condition_enc")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("wash_days").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("user_products").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    const hair = (hairRes?.data ?? null) as
      | {
          porosity?: unknown;
          curl_pattern?: unknown;
          areas_of_concern?: unknown;
          scalp_condition_enc?: unknown;
        }
      | null;

    let scalp: string | null = null;
    if (hair?.scalp_condition_enc) {
      try {
        scalp = (await decryptScalp(hair.scalp_condition_enc)) ?? null;
      } catch {
        scalp = null; // never surface a decrypt failure on a save screen
      }
    }

    return {
      porosity: typeof hair?.porosity === "string" ? hair.porosity : null,
      scalpCondition: scalp,
      areasOfConcern: Array.isArray(hair?.areas_of_concern)
        ? (hair!.areas_of_concern as unknown[]).filter((a): a is string => typeof a === "string")
        : [],
      curlPattern: typeof hair?.curl_pattern === "string" ? hair.curl_pattern : null,
      washDayCount: Number(washRes?.count ?? 0) || 0,
      productScanCount: Number(prodRes?.count ?? 0) || 0,
    };
  } catch (e) {
    console.error(
      "[trial-save-personalisation] signal load failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return empty;
  }
}
