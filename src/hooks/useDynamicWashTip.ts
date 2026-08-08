// useDynamicWashTip — generates & caches a personalised wash-day tip per user.
//
// Builds a stable fingerprint from the user's live data (hair profile, health,
// blood flags, goals, challenges, current + planned style, how her hair has
// felt, and an aggregate of EVERY logged wash day). The edge function caches
// the tip against that fingerprint so identical inputs return instantly and
// don't burn tokens. The tip only regenerates when the user's data actually
// changes — consistent with STRAND's static-page behaviour.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";
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

const hashString = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

export async function loadStyleTipContext(userId: string) {
  return loadContext(userId);
}

async function loadContext(userId: string) {
  const [
    hairRes,
    healthRes,
    styleRes,
    goalsRes,
    bloodsRes,
    washRes,
  ] = await Promise.all([
    supabase.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_goals")
      .select("title, kind, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    supabase
      .from("blood_results")
      .select("marker, value, unit, status, category")
      .eq("user_id", userId),
    supabase.from("wash_days").select("id").eq("user_id", userId).limit(1),
  ]);

  const hair = hairRes.data as Record<string, unknown> | null;
  const health = healthRes.data as Record<string, unknown> | null;
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
  const { level } = useTipsLevel();

  return useQuery({
    queryKey: ["wash_day_tip_v4_reason", user?.id, level],
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<DynamicWashTip | null> => {
      if (!user?.id) return null;
      const [ctx, signals, history] = await Promise.all([
        loadContext(user.id),
        loadResponsiveSignals(user.id),
        loadWashHistory(user.id),
      ]);
      const h = ctx.hair as { hair_type?: string; porosity?: string; density?: string; scalp_condition?: string } | null;
      const he = ctx.health as { overall_health?: string } | null;
      const s = ctx.style as {
        current_hairstyle?: string;
        days_in_style?: number | null;
        planned_next_style?: string | null;
        current_style_tension?: string | null;
        current_style_extensions?: boolean | null;
      } | null;
      const fingerprint = hashString(
        [
          "wash-tip-v4-reason",
          h?.hair_type ?? "",
          h?.porosity ?? "",
          h?.density ?? "",
          h?.scalp_condition ?? "",
          he?.overall_health ?? "",
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

      const { data, error } = await supabase.functions.invoke("wash-day-tip", {
        body: {
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
        },
      });

      if (error) {
        console.warn("[useDynamicWashTip] invoke failed", error.message);
        return null;
      }
      return (data as { tip?: DynamicWashTip } | null)?.tip ?? null;
    },
  });
}
