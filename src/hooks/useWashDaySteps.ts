// useWashDaySteps — this user's personalised, manuscript-grounded wash day
// sequence, generated at runtime by the `wash-day-steps` edge function.
//
// There is deliberately NO static fallback copy: if generation fails, the
// section shows an error state rather than untested hair-care instruction.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import {
  loadResponsiveSignals,
  responsiveSignatureParts,
  styleSignatureParts,
} from "@/lib/tipSignature";


export interface WashDayStep {
  n: number;
  headline: string;
  body: string;
  why?: string;
  icon_hint?: string;
  product_ref?: string;
}

const hashString = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

interface ShelfRow {
  id: string;
  name: string | null;
  brand: string | null;
  category: string | null;
}

async function loadInputs(userId: string) {
  const [hairRes, styleRes, goalsRes, bloodsRes, shelfRes, toolsRes] = await Promise.all([
    supabase.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
    // The app writes goal status `in_progress` (see useGoals); `active` is
    // legacy only, so filtering on it alone sent an empty goals array.
    supabase
      .from("user_goals")
      .select("title, kind, status")
      .eq("user_id", userId)
      .in("status", ["in_progress", "active"])
      .is("ended_at", null)
      .limit(5),

    supabase.from("blood_results").select("marker, value, status").eq("user_id", userId),
    supabase
      .from("user_products")
      .select("id, name, brand, category")
      .eq("user_id", userId)
      .eq("on_shelf", true)
      .order("name", { ascending: true }),
    supabase
      .from("user_tools")
      .select("id, name, brand, category")
      .eq("user_id", userId)
      .eq("on_shelf", true)
      .order("name", { ascending: true }),
  ]);

  return {
    hair: (hairRes.data ?? null) as Record<string, unknown> | null,
    style: (styleRes.data ?? null) as Record<string, unknown> | null,
    goals: (goalsRes.data ?? []) as Array<{ title: string; kind: string | null }>,
    bloodFlags: (bloodsRes.data ?? [])
      .filter((b) => b.status && String(b.status).toLowerCase() !== "normal")
      .map((b) => ({ marker: b.marker, status: b.status ?? undefined, value: b.value })),
    shelf: (shelfRes.data ?? []) as ShelfRow[],
    tools: (toolsRes.data ?? []) as ShelfRow[],
  };
}

export interface WashDayStepsResult {
  steps: WashDayStep[];
  /** True when the server served her previous sequence because a fresh
   *  generation failed — the UI says so and refreshes in the background. */
  stale: boolean;
}

export function useWashDaySteps() {
  const { user } = useAuth();
  const { level } = useTipsLevel();

  return useQuery({
    queryKey: ["wash_day_steps_v2", user?.id, level],
    enabled: !!user?.id,
    // A SUCCESSFUL sequence is cached for the session; a FAILURE never is.
    // React Query keeps an errored query in the cache too, and with
    // staleTime/gcTime Infinity that error used to stick for the whole session:
    // the card said "could not be prepared" and never attempted again (this is
    // what produced the 2026-08-26 report where no call was made at all).
    staleTime: (query) => (query.state.error ? 0 : Infinity),
    gcTime: Infinity,
    // ONE retry, and ONLY for a transport failure — a dropped request, 502/504,
    // abort or timeout, where no generation completed and nothing was paid for.
    // A completed-but-rejected generation (503 guidance_unavailable, or an empty
    // sequence) is never retried: the expensive work already happened, so the
    // card falls through to her last good sequence or the honest error state.
    retry: retryTransportOnce,
    retryDelay: aiRetryDelay,
    // Failures are transient — every remount re-attempts.
    refetchOnMount: (query) => (query.state.error ? "always" : false),
    // Stays OFF. Switching apps and back must never buy a new generation.
    refetchOnWindowFocus: false,


    queryFn: async (): Promise<WashDayStepsResult> => {
      if (!user?.id) return { steps: [], stale: false };

      const [ctx, signals] = await Promise.all([
        loadInputs(user.id),
        loadResponsiveSignals(user.id),
      ]);
      const h = ctx.hair as Record<string, string | null> | null;
      const s = ctx.style as Record<string, string | number | boolean | null> | null;

      // Fingerprint — anything here changing regenerates the sequence.
      const fingerprint = hashString(
        [
          `v3-responsive`,
          h?.hair_type ?? "",
          h?.surface_texture ?? "",
          h?.porosity ?? "",
          h?.density ?? "",
          h?.length ?? h?.hair_length ?? "",
          h?.scalp_condition ?? "",
          ...styleSignatureParts(s as Record<string, unknown> | null),
          ctx.goals.map((g) => `${g.kind ?? ""}:${g.title ?? ""}`).sort().join("|"),
          ctx.shelf.map((p) => p.id).sort().join(","),
          ctx.tools.map((t) => t.id).sort().join(","),
          ctx.bloodFlags.map((b) => `${b.marker}:${b.status}`).sort().join("|"),
          ...responsiveSignatureParts(signals),
          `tl${level}`,
        ].join("::"),
      );

      const { data, error } = await supabase.functions.invoke("wash-day-steps", {
        body: {
          fingerprint,
          hairProfile: h,
          currentStyle: s
            ? {
                current_hairstyle: s.current_hairstyle,
                days_in_style: s.days_in_style,
                planned_next_style: s.planned_next_style,
                current_style_tension: s.current_style_tension ?? null,
                current_style_extensions: s.current_style_extensions ?? null,
                planned_style_tension: s.planned_style_tension ?? null,
                planned_style_extensions: s.planned_style_extensions ?? null,
              }
            : null,
          goals: ctx.goals.map((g) => ({ title: g.title, category: g.kind ?? undefined })),
          bloodFlags: ctx.bloodFlags,
          challenges: signals.challenges,
          areasOfConcern: signals.areasOfConcern,
          recentWashDay: signals.recentWashDay,
          recentAppointment: signals.recentAppointment,

          shelf: ctx.shelf.map((p) => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            category: p.category,
          })),
          tools: ctx.tools.map((t) => ({
            id: t.id,
            name: t.name,
            brand: t.brand,
            category: t.category,
          })),
          tipsLevel: level,
        },
      });
      if (error) throw new Error(error.message);
      const res = data as { steps?: WashDayStep[]; stale?: boolean } | null;
      const returned = (res?.steps ?? []) as WashDayStep[];
      // An empty sequence is a failure, not a result: treated as an error so the
      // card offers "Try again" instead of sitting there silently disabled, and
      // so nothing hollow is ever held as though it were her sequence.
      if (returned.length === 0) throw new Error("no_steps_returned");
      return { steps: returned, stale: res?.stale === true };


    },
  });
}
