// Centralised builder for the AI context object that every Lovable AI Gateway
// call should include. Pulls live data from Lovable Cloud (Supabase) for the
// current user. When a slice is missing or fails, we keep the rest and return
// `null` for that slice — callers and prompts handle gracefully.
//
// Usage:
//   const context = await buildAiContext();
//   await supabase.functions.invoke("blood-ai-summary", {
//     body: { ...payload, context },
//   });
//
// See PROMPT 5 in the project brief for the full schema.

import { supabase } from "@/integrations/supabase/client";
import { isHardWaterPostcode } from "@/data/hardWaterPostcodes";

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
  professional: {
    professional_type: string | null;
    last_consultation_date: string | null;
    professional_notes: string | null;
  } | null;
  location: { is_hard_water_area: boolean | null; postcode: string | null };
  history: {
    last_3_wash_days: Array<Record<string, unknown>>;
    avoid_ingredients: string[];
    favourite_ingredients: string[];
  };
}

const safeParse = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const daysSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
};

export async function buildAiContext(): Promise<AiContext> {
  const hairProfile = safeParse<Record<string, unknown> | null>("strand_hair_profile", null);
  const healthProfileLocal = safeParse<Record<string, unknown> | null>("strand_health_profile", null);
  const profileStep1 = safeParse<Record<string, unknown> | null>("strand_profile_step1", null);
  const styleLocal = safeParse<Record<string, unknown> | null>("strand_current_style", null);
  const proLocal = safeParse<Record<string, unknown> | null>("strand_professional", null);
  const lastWashIso = (() => {
    try {
      return localStorage.getItem("strand_last_wash_date");
    } catch {
      return null;
    }
  })();
  const localWashHistory = safeParse<Array<Record<string, unknown>>>("strand_wash_history", []);

  const postcode =
    (profileStep1?.postcode as string | undefined) ??
    (hairProfile?.postcode as string | undefined) ??
    null;

  let bloodResults: Array<Record<string, unknown>> = [];
  let avoidIngredients: string[] = [];
  let favouriteIngredients: string[] = [];

  try {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (userId) {
      const [blood, ingLists, meds] = await Promise.all([
        supabase
          .from("blood_results")
          .select("marker, value, unit, status, category")
          .eq("user_id", userId),
        supabase
          .from("ingredient_lists")
          .select("ingredient, list_kind, reason, product_count")
          .eq("user_id", userId),
        supabase
          .from("user_medications")
          .select("name, category")
          .eq("user_id", userId),
      ]);
      bloodResults = (blood.data ?? []) as Array<Record<string, unknown>>;
      const lists = ingLists.data ?? [];
      avoidIngredients = lists
        .filter((r) => r.list_kind === "avoid")
        .map((r) => r.ingredient);
      favouriteIngredients = lists
        .filter((r) => r.list_kind === "favourite")
        .map((r) => r.ingredient);
      // Merge meds back into healthProfile so prompts always see them.
      if (healthProfileLocal && meds.data) {
        healthProfileLocal.medications = meds.data.map((m) => m.name);
      }
    }
  } catch (e) {
    console.warn("buildAiContext: backend fetch failed", e);
  }

  const currentStyle = styleLocal
    ? {
        current_hairstyle: (styleLocal.current_hairstyle as string) ?? null,
        style_set_on: (styleLocal.style_set_on as string) ?? null,
        days_in_style: daysSince(((styleLocal.style_set_on as string) ?? null)),
        planned_next_style: (styleLocal.planned_next_style as string) ?? null,
        planned_change_date: (styleLocal.planned_change_date as string) ?? null,
        default_style: (styleLocal.default_style as string) ?? null,
      }
    : null;

  const professional = proLocal
    ? {
        professional_type: (proLocal.type as string) ?? null,
        last_consultation_date: (proLocal.date as string) ?? null,
        professional_notes: (proLocal.notes as string) ?? null,
      }
    : null;

  const last3 = [...localWashHistory]
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, 3);
  if (last3.length === 0 && lastWashIso) {
    last3.push({ date: lastWashIso });
  }

  return {
    hairProfile,
    currentStyle,
    healthProfile: healthProfileLocal,
    bloodResults,
    professional,
    location: {
      postcode: postcode ?? null,
      is_hard_water_area: postcode ? isHardWaterPostcode(postcode) : null,
    },
    history: {
      last_3_wash_days: last3,
      avoid_ingredients: avoidIngredients,
      favourite_ingredients: favouriteIngredients,
    },
  };
}
