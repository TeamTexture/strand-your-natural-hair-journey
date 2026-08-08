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
    supabase
      .from("user_goals")
      .select("title, kind, status")
      .eq("user_id", userId)
      .eq("status", "active")
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

export function useWashDaySteps() {
  const { user } = useAuth();
  const { level } = useTipsLevel();

  return useQuery({
    queryKey: ["wash_day_steps_v2", user?.id, level],
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<WashDayStep[]> => {
      if (!user?.id) return [];
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
      return ((data as { steps?: WashDayStep[] } | null)?.steps ?? []) as WashDayStep[];
    },
  });
}
