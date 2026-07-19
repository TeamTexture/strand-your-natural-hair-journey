// Centralised builder for the AI context object that every Lovable AI Gateway
// call should include. Pulls live data from Lovable Cloud (Supabase) for the
// current user. When a slice is missing or fails, we keep the rest and return
// `null` for that slice — callers and prompts handle gracefully.
//
// Phase 1: clinical slices come from the new Postgres tables via
// loadClinicalContext() (see src/lib/clinicalContext.ts), which transparently
// falls back to legacy localStorage during the rollout window. The exported
// AiContext shape and buildAiContext() signature are unchanged so that no AI
// edge function needs editing in this PR.
//
// Usage:
//   const context = await buildAiContext();
//   await supabase.functions.invoke("blood-ai-summary", {
//     body: { ...payload, context },
//   });

import { supabase } from "@/integrations/supabase/client";

import { loadClinicalContext } from "@/lib/clinicalContext";

export interface AiContext {
  hairProfile: Record<string, unknown> | null;
  currentStyle: {
    current_hairstyle: string | null;
    days_in_style: number | null;
    style_set_on: string | null;
    planned_next_style: string | null;
    planned_change_date: string | null;
    default_style: string | null;
  } | null;
  healthProfile: Record<string, unknown> | null;
  bloodResults: Array<Record<string, unknown>>;
  /** History of previous blood-test panels (latest first, up to 3), each with
   *  its date, its own results, and a per-marker delta vs the panel BEFORE it.
   *  Empty array when the user has no prior tests. */
  bloodPanels: Array<{
    panel_id: string;
    panel_date: string | null;
    label: string | null;
    results: Array<{ marker: string; value: number | null; unit: string | null; status: string | null; category: string | null }>;
    deltas: Array<{ marker: string; previous_value: number | null; current_value: number | null; direction: "up" | "down" | "unchanged"; previous_status: string | null; current_status: string | null }>;
  }>;
  professional: {
    professional_type: string | null;
    last_consultation_date: string | null;
    professional_notes: string | null;
  } | null;
  location: {
    postcode: string | null;
  };
  history: {
    last_3_wash_days: Array<Record<string, unknown>>;
    /** Single unified list of ingredients that appear in 3+ of the user's
     *  saved products. Educational — no good/bad framing. */
    flagged_ingredients: string[];
    /** @deprecated kept for backwards-compat with edge-function prompts that
     *  still reference these names. Mirrors flagged_ingredients. */
    avoid_ingredients: string[];
    /** @deprecated kept for backwards-compat with edge-function prompts that
     *  still reference these names. Mirrors flagged_ingredients. */
    favourite_ingredients: string[];
    low_rated_products: Array<Record<string, unknown>>;
    high_rated_products: Array<Record<string, unknown>>;
  };
  goals: Array<{
    kind: string;
    title: string;
    challenge: string | null;
    target_text: string | null;
    target_value: number | null;
    target_date: string | null;
    unit: string;
    status: string;
  }>;
  shelf: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  wishlist: Array<Record<string, unknown>>;
}

const safeParse = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** True iff the legacy `strand_*` localStorage payload on this device was
 *  written for the currently-signed-in user. When false, the caller MUST NOT
 *  read user-scoped strand_* keys — they belong to a different account that
 *  previously signed in here (cross-account leak guard, see hotfix on top of
 *  1c97c85). */
const localStorageIsForUser = (userId: string | null): boolean => {
  if (!userId) return false;
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("strand_migration_v1_user_id") === userId;
  } catch {
    return false;
  }
};

const daysSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
};

export async function buildAiContext(): Promise<AiContext> {
  // Resolve the user first — every localStorage fallback below must be gated
  // on `localStorageIsForUser(userId)` so we never serve a previous account's
  // cached strand_* payload to a freshly-signed-in user on the same browser.
  let userId: string | null = null;
  try {
    const { data: u } = await supabase.auth.getUser();
    userId = u?.user?.id ?? null;
  } catch {
    userId = null;
  }
  const localOk = localStorageIsForUser(userId);

  // Clinical slices (DB + decrypt with localStorage fallback). Pass through
  // whether legacy localStorage is safe to read for THIS user.
  const clinicalPromise = loadClinicalContext({ allowLocalFallback: localOk });

  const lastWashIso = (() => {
    if (!localOk) return null;
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("strand_last_wash_date");
    } catch {
      return null;
    }
  })();
  const localWashHistory = localOk
    ? safeParse<Array<Record<string, unknown>>>("strand_wash_history", [])
    : [];

  let bloodResults: Array<Record<string, unknown>> = [];
  let bloodPanels: AiContext["bloodPanels"] = [];
  let flaggedIngredients: string[] = [];
  let recentWashes: Array<Record<string, unknown>> = [];
  let shelf: Array<Record<string, unknown>> = [];
  let lowRated: Array<Record<string, unknown>> = [];
  let highRated: Array<Record<string, unknown>> = [];
  let goals: AiContext["goals"] = [];
  let tools: Array<Record<string, unknown>> = [];
  let wishlist: Array<Record<string, unknown>> = [];

  try {
    if (userId) {
      const [panels, ingLists, washes, shelfRows, wishRows, ratings, goalRows, toolRows] = await Promise.all([
        supabase
          .from("blood_panels" as never)
          .select("id, panel_date, label")
          .eq("user_id", userId)
          .order("panel_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("ingredient_lists")
          .select("ingredient, list_kind, reason, product_count")
          .eq("user_id", userId),
        supabase
          .from("wash_days")
          .select("wash_date, steps, scalp_feel, breakage, hair_feel_note, style_after")
          .eq("user_id", userId)
          .order("wash_date", { ascending: false })
          .limit(3),
        supabase
          .from("user_products")
          .select("name, brand, category, ingredients, key_ingredients, match_score, rating")
          .eq("user_id", userId)
          .eq("on_shelf", true),
        supabase
          .from("user_products")
          .select("name, brand, category, match_score")
          .eq("user_id", userId)
          .eq("on_wishlist", true),
        supabase
          .from("product_ratings")
          .select("product_name, product_brand, rating, ingredients")
          .eq("user_id", userId),
        supabase
          .from("user_goals")
          .select("kind, title, challenge, target_text, target_value, target_date, unit, status")
          .eq("user_id", userId),
        supabase
          .from("user_tools")
          .select("name, brand, category, rating, match_score, on_favourite, use_count")
          .eq("user_id", userId),
      ]);


      // Load rows for the returned panels; also fetch legacy rows with NULL panel_id
      // as a fallback for accounts that pre-date the panels migration.
      const panelRows = ((panels as { data?: Array<{ id: string; panel_date: string | null; label: string | null }> }).data) ?? [];
      const panelIds = panelRows.map((p) => p.id);
      let allBloodRows: Array<Record<string, unknown>> = [];
      if (panelIds.length > 0) {
        const { data: br } = await supabase
          .from("blood_results")
          .select("marker, value, unit, status, category, panel_id")
          .eq("user_id", userId)
          .in("panel_id" as never, panelIds as never);
        allBloodRows = (br ?? []) as Array<Record<string, unknown>>;
      } else {
        const { data: br } = await supabase
          .from("blood_results")
          .select("marker, value, unit, status, category")
          .eq("user_id", userId);
        allBloodRows = (br ?? []) as Array<Record<string, unknown>>;
      }

      // Latest-panel rows drive the primary `bloodResults` slice so existing
      // prompts continue to see one flat list of the current test.
      const latestPanelId = panelRows[0]?.id ?? null;
      bloodResults = latestPanelId
        ? allBloodRows.filter((r) => r.panel_id === latestPanelId)
        : allBloodRows;

      // Build the panels array with per-marker deltas vs the previous panel.
      const rowsByPanel = new Map<string, Array<Record<string, unknown>>>();
      for (const r of allBloodRows) {
        const pid = String(r.panel_id ?? "");
        if (!rowsByPanel.has(pid)) rowsByPanel.set(pid, []);
        rowsByPanel.get(pid)!.push(r);
      }
      const panelsOut = panelRows.map((p, idx) => {
        const rows = rowsByPanel.get(p.id) ?? [];
        const prior = panelRows[idx + 1];
        const priorRows = prior ? (rowsByPanel.get(prior.id) ?? []) : [];
        const priorByMarker = new Map<string, Record<string, unknown>>();
        for (const r of priorRows) priorByMarker.set(String(r.marker), r);
        const deltas = rows
          .map((r) => {
            const prev = priorByMarker.get(String(r.marker));
            const curVal = r.value == null ? null : Number(r.value);
            const prevVal = prev && prev.value != null ? Number(prev.value) : null;
            if (curVal == null || prevVal == null) return null;
            const diff = curVal - prevVal;
            const direction: "up" | "down" | "unchanged" =
              diff > 0 ? "up" : diff < 0 ? "down" : "unchanged";
            return {
              marker: String(r.marker),
              previous_value: prevVal,
              current_value: curVal,
              direction,
              previous_status: (prev?.status as string | null) ?? null,
              current_status: (r.status as string | null) ?? null,
            };
          })
          .filter((d): d is NonNullable<typeof d> => d !== null);
        return {
          panel_id: p.id,
          panel_date: p.panel_date,
          label: p.label,
          results: rows.map((r) => ({
            marker: String(r.marker),
            value: r.value == null ? null : Number(r.value),
            unit: (r.unit as string | null) ?? null,
            status: (r.status as string | null) ?? null,
            category: (r.category as string | null) ?? null,
          })),
          deltas,
        };
      });
      bloodPanels = panelsOut;
      const lists = ingLists.data ?? [];
      // Single unified flag list — appears in 3+ of the user's products.
      flaggedIngredients = lists
        .filter((r) => r.list_kind === "flag")
        .map((r) => r.ingredient);
      recentWashes = (washes.data ?? []) as Array<Record<string, unknown>>;
      shelf = (shelfRows.data ?? []) as Array<Record<string, unknown>>;
      const allRatings = (ratings.data ?? []) as Array<Record<string, unknown>>;
      lowRated = allRatings.filter((r) => Number(r.rating) <= 2);
      highRated = allRatings.filter((r) => Number(r.rating) >= 4);
      goals = (goalRows.data ?? []) as AiContext["goals"];
      tools = (toolRows.data ?? []) as Array<Record<string, unknown>>;
      wishlist = (wishRows.data ?? []) as Array<Record<string, unknown>>;
    }
  } catch (e) {
    console.warn("buildAiContext: backend fetch failed", e);
  }

  const clinical = await clinicalPromise;

  // Build the AiContext-shaped slices from the loaded clinical context.
  const hairProfile: Record<string, unknown> | null = clinical.hair
    ? {
        diameter: clinical.hair.diameter,
        texture: clinical.hair.texture,
        density: clinical.hair.density,
        porosity: clinical.hair.porosity,
        elasticity: clinical.hair.elasticity,
        scalp: clinical.hair.scalp,
        diagnosed: clinical.hair.diagnosed,
        areas: clinical.hair.areas,
      }
    : null;

  const healthProfile: Record<string, unknown> | null = clinical.health
    ? {
        lifeStage: clinical.health.lifeStage,
        contraception: clinical.health.contraception,
        conditions: clinical.health.conditions,
        diet: clinical.health.diet,
        dietBalance: clinical.health.dietBalance,
        smoke: clinical.health.smoke,
        alcohol: clinical.health.alcohol,
        water: clinical.health.water,
        exercise: clinical.health.exercise,
        sleep: clinical.health.sleep,
        medications: clinical.health.medications,
      }
    : null;

  const currentStyle = clinical.style
    ? {
        current_hairstyle: clinical.style.current_hairstyle,
        style_set_on: clinical.style.style_set_at,
        days_in_style: daysSince(clinical.style.style_set_at),
        planned_next_style: clinical.style.planned_next_style,
        planned_change_date: clinical.style.planned_change_date,
        default_style: clinical.style.default_styles[0] ?? null,
      }
    : null;

  const professional = clinical.professional
    ? {
        professional_type: clinical.professional.professional_type,
        last_consultation_date: clinical.professional.consultation_date,
        professional_notes: clinical.professional.notes,
      }
    : null;

  const postcode = clinical.basic?.postcode ?? null;
  const waterBand = clinical.basic?.water_hardness_band ?? null;
  const isHardWater =
    waterBand === "hard" || waterBand === "very_hard" || waterBand === "moderately_hard"
      ? true
      : waterBand
        ? false
        : null;

  const last3Local = [...localWashHistory]
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, 3);
  const last3 = recentWashes.length > 0 ? recentWashes : last3Local;
  if (last3.length === 0 && lastWashIso) {
    last3.push({ date: lastWashIso });
  }

  const result: AiContext = {
    hairProfile,
    currentStyle,
    healthProfile,
    bloodResults,
    bloodPanels,
    professional,
    location: {
      postcode: postcode ?? null,
      is_hard_water_area: isHardWater,
      water_hardness_band: waterBand,
      water_hardness_mg_l: clinical.basic?.water_hardness_mg_l ?? null,
      water_supplier: clinical.basic?.water_supplier ?? null,
    },
    history: {
      last_3_wash_days: last3,
      flagged_ingredients: flaggedIngredients,
      // Mirror to deprecated keys so existing edge-function prompts keep
      // resolving — they treat both the same neutral way.
      avoid_ingredients: flaggedIngredients,
      favourite_ingredients: flaggedIngredients,
      low_rated_products: lowRated,
      high_rated_products: highRated,
    },
    goals,
    shelf,
    tools,
    wishlist,
  };

  // Diagnostic — confirms the freshly-built context the client is about to
  // send to AI edge functions reflects the user's CURRENT profile.
  console.log("[ai-context] built", {
    currentStyle: result.currentStyle,
    currentGoals: result.goals?.map((g) => g.title) ?? [],
    currentChallenges: result.goals?.map((g) => g.challenge).filter(Boolean) ?? [],
    builtAt: new Date().toISOString(),
  });

  return result;
}
