// useDynamicWashTip — generates & caches a personalised wash-day tip per user.
//
// Builds a stable fingerprint from the user's live data (hair profile, health,
// blood flags, goals, challenges, current + planned style, how her hair has
// felt, and an aggregate of EVERY logged wash day). The edge function caches
// the tip against that fingerprint so identical inputs return instantly and
// don't burn tokens. The tip only regenerates when the user's data actually
// changes — consistent with STRAND's static-page behaviour.

import { useQuery } from "@tanstack/react-query";
import { readLastGood, writeLastGood } from "@/lib/lastGoodTip";
import { useCurrentStyleToken } from "@/hooks/useCurrentStyleToken";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadDecryptedContextResult } from "@/lib/clinicalContext";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { aiInvoke } from "@/lib/aiInvoke";
import {
  loadResponsiveSignals,
  responsiveSignatureParts,
  styleSignatureParts,
} from "@/lib/tipSignature";
import {
  aggregateWashHistory,
  washHistorySignatureParts,
  type AggregatableWashDay,
} from "@/lib/washHistoryAggregate";


export interface DynamicWashTip {
  headline: string;
  /** One concrete instruction for the next wash day. Present at every support
   *  level — the card renders it ungated. */
  action: string;
  /** WHY that action matters for this member — the mechanism or the
   *  consequence of skipping it. Required at every support level and rendered
   *  ungated beside the action. */
  reason: string;
  why: string;
  technique: string;
  /**
   * Optional "something to try next wash day" section, rendered inside the
   * same card. Omitted by the model when there is nothing worth suggesting.
   */
  next_time?: string | null;
}

interface DynamicWashTipResponse {
  tip?: DynamicWashTip;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

const hashString = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

export async function loadStyleTipContext(userId: string) {
  return loadContext(userId);
}

/** Encrypted columns must never travel to the model as ciphertext, and the raw
 *  row carries `*_enc` blobs. Keep the plain clinical fields only. */
const cleanRow = (row: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith("_enc") || k === "id" || k === "user_id" || k === "created_at" || k === "updated_at") continue;
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
};

async function loadContext(userId: string) {
  const [
    hairRes,
    healthRes,
    styleRes,
    goalsRes,
    bloodsRes,
    washRes,
    decryptRes,
  ] = await Promise.all([
    supabase.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
    // GOAL STATUS: the app writes `in_progress` (see useGoals); only legacy rows
    // say `active`. Filtering on `active` alone sent an empty goals array to
    // every tip prompt, so no member's goal was ever cited.
    supabase
      .from("user_goals")
      .select("title, kind, status, ended_at")
      .eq("user_id", userId)
      .in("status", ["in_progress", "active"])
      .is("ended_at", null)
      .limit(5),
    supabase
      .from("blood_results")
      .select("marker, value, unit, status, category")
      .eq("user_id", userId),
    supabase.from("wash_days").select("id").eq("user_id", userId).limit(1),
    loadDecryptedContextResult(),
  ]);

  // A failed decrypt is UNKNOWN, never "nothing recorded" — the merge below is
  // additive, so a failure simply leaves the plaintext row untouched.
  const decrypted = decryptRes.ok ? decryptRes.data : null;

  // The scalp condition and diagnosed conditions live encrypted — merge the

  // decrypted values in so the prompt sees the real clinical picture.
  const hair = cleanRow(hairRes.data as Record<string, unknown> | null) as Record<string, unknown> | null;
  if (hair) {
    if (decrypted?.hair?.scalp_condition) hair.scalp_condition = decrypted.hair.scalp_condition;
    if (decrypted?.hair?.diagnosed_conditions?.length)
      hair.diagnosed_conditions = decrypted.hair.diagnosed_conditions;
  }
  const health = cleanRow(healthRes.data as Record<string, unknown> | null) as Record<string, unknown> | null;
  if (health && decrypted?.health) {
    if (decrypted.health.life_stage) health.life_stage = decrypted.health.life_stage;
    if (decrypted.health.medical_conditions?.length)
      health.medical_conditions = decrypted.health.medical_conditions;
    if (decrypted.health.contraception?.length)
      health.contraception = decrypted.health.contraception;
  }
  const style = styleRes.data as Record<string, unknown> | null;
  const goals = (goalsRes.data ?? []) as Array<{ title: string; kind: string | null; status: string | null }>;
  const bloodFlags = (bloodsRes.data ?? [])
    .filter((b) => b.status && String(b.status).toLowerCase() !== "normal")
    .map((b) => ({ marker: b.marker, status: b.status, value: b.value }));
  const hasWashHistory = (washRes.data ?? []).length > 0;

  return { hair, health, style, goals, bloodFlags, hasWashHistory };
}


/**
 * ALL logged wash days plus the member's shelf. Patterns across the whole
 * history are the point of this tip, so nothing is limited to the latest log.
 * Products are shelf-only: suggestions are made from what she already owns,
 * and the deterministic resolver (src/lib/productMatch.ts, rendered through
 * smartInline) links any shelf product named in the copy.
 */
async function loadWashHistory(userId: string) {
  const [washRes, shelfRes] = await Promise.all([
    supabase
      .from("wash_days")
      .select(
        "id, wash_date, steps, heat_treatment, styling, scalp_feel, breakage, hair_feel_note, hair_feel_voice_url, style_after, style_extensions, style_tension, product_ids",
      )
      .eq("user_id", userId)
      .order("wash_date", { ascending: false }),
    supabase
      .from("user_products")
      .select("name, brand, category")
      .eq("user_id", userId)
      .eq("on_shelf", true)
      .limit(40),
  ]);

  const aggregate = aggregateWashHistory(
    ((washRes.data ?? []) as unknown as AggregatableWashDay[]),
  );
  const shelfProducts = ((shelfRes.data ?? []) as Array<{
    name: string;
    brand: string | null;
    category: string | null;
  }>).map((p) => ({ name: p.name, brand: p.brand, category: p.category }));

  return { aggregate, shelfProducts };
}

export function useDynamicWashTip() {
  const { user } = useAuth();
  const { level, ready: levelReady } = useTipsLevel();
  // Last-good copy is scoped to the style it was written for.
  const { token: styleToken, ready: styleReady } = useCurrentStyleToken();

  return useQuery({
    queryKey: ["wash_day_tip_v4_reason", user?.id, level, styleToken],
    enabled: !!user?.id && levelReady && styleReady,
    staleTime: Infinity,
    gcTime: Infinity,
    // Stale-while-revalidate: a style change invalidates this tip, so render the
    // last good one until the freshly personalised tip arrives.
    placeholderData: () =>
      readLastGood<DynamicWashTip>("wash-day-tip", level, styleToken, (t) =>
        !!t?.action && !!(t?.reason ?? t?.why)),
    queryFn: async (): Promise<DynamicWashTip | null> => {
      if (!user?.id) return null;
      const [ctx, signals, history] = await Promise.all([
        loadContext(user.id),
        loadResponsiveSignals(user.id),
        loadWashHistory(user.id),
      ]);
      const h = ctx.hair as
        | (Record<string, unknown> & {
            porosity?: string;
            density?: string;
            scalp_condition?: string;
            surface_texture?: string;
            length_bucket?: string;
          })
        | null;
      const he = ctx.health as (Record<string, unknown> & { overall_health?: string }) | null;
      const s = ctx.style as {
        current_hairstyle?: string;
        days_in_style?: number | null;
        planned_next_style?: string | null;
        current_style_tension?: string | null;
        current_style_extensions?: boolean | null;
      } | null;
      const fingerprint = hashString(
        [
          "wash-tip-v5-context",
          String(h?.surface_texture ?? ""),
          String(h?.porosity ?? ""),
          String(h?.density ?? ""),
          String(h?.length_bucket ?? ""),
          String(h?.scalp_condition ?? ""),
          String(he?.overall_health ?? he?.life_stage ?? ""),

          ...styleSignatureParts(ctx.style as Record<string, unknown> | null),
          ctx.hasWashHistory ? "wash" : "no-wash",
          ctx.bloodFlags.map((b) => `${b.marker}:${b.status}`).sort().join("|"),
          ctx.goals.map((g) => `${g.kind ?? ""}:${g.title ?? ""}`).sort().join("|"),
          ...responsiveSignatureParts(signals),
          // Aggregate of every log — a new wash day, a cadence shift, recurring
          // breakage or a product rotation change all invalidate the tip.
          ...washHistorySignatureParts(history.aggregate),
          `shelf:${history.shelfProducts.map((p) => `${p.brand ?? ""} ${p.name}`).sort().join("|")}`,
        ].join("::"),
      );

      const { data, error } = await aiInvoke<DynamicWashTipResponse>("wash-day-tip", {
          fingerprint,
          hairProfile: h,
          healthProfile: he,
          currentStyle: s
            ? {
                current_hairstyle: s.current_hairstyle,
                days_in_style: s.days_in_style,
                planned_next_style: s.planned_next_style,
                current_style_tension: s.current_style_tension ?? null,
                current_style_extensions: s.current_style_extensions ?? null,
                planned_style_tension:
                  (ctx.style as Record<string, unknown> | null)?.planned_style_tension ?? null,
                planned_style_extensions:
                  (ctx.style as Record<string, unknown> | null)?.planned_style_extensions ?? null,
              }
            : null,
          goals: ctx.goals.map((g) => ({ title: g.title, category: g.kind ?? undefined })),
          bloodFlags: ctx.bloodFlags,
          hasWashHistory: ctx.hasWashHistory,
          challenges: signals.challenges,
          areasOfConcern: signals.areasOfConcern,
          recentWashDay: signals.recentWashDay,
          recentAppointment: signals.recentAppointment,
          washHistory: history.aggregate,
          hairFeelNotes: history.aggregate.hairFeelNotes,
          shelfProducts: history.shelfProducts,
          tipsLevel: level,
      });

      if (error) {
        console.warn("[useDynamicWashTip] invoke failed", errorMessage(error));
        // NEVER A BLANK CARD ON A TRANSIENT FAILURE. Serve the last tip that
        // passed the guardrails rather than the "we couldn't finish" state.
        // Nothing new is invented — this is her own previously served tip.
        return (
          readLastGood<DynamicWashTip>("wash-day-tip", level, styleToken, (t) =>
            !!t?.action && !!(t?.reason ?? t?.why)) ?? null
        );
      }

      const tip = data?.tip ?? null;
      writeLastGood<DynamicWashTip>("wash-day-tip", tip, level, styleToken, (t) =>
        !!t?.action && !!(t?.reason ?? t?.why));
      return tip;
    },
  });
}
