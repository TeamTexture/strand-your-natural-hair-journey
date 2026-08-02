// Curated educational content — the ONLY source of static hair-care teaching
// copy in the consumer app.
//
// HARDCODED EDUCATION BAN (Paige, 2026-08-02): hair-care education may never
// be written by hand in the frontend. Every teaching surface reads a published
// row from `curated_content`, which is generated from the manuscript by the
// `regenerate-curated-content` edge function and published only after Paige
// has checked it against her book. When no published row exists, the surface
// renders NOTHING — there is deliberately no hardcoded fallback.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Every curated educational key used by the consumer app. */
export type CuratedKey =
  | "wash-day-steps"
  | "trim-length-retention"
  | "wash-day-guidance"
  | "wash-log-scalp-and-breakage"
  | "wash-log-hair-feel"
  | "wash-log-styling";

export interface CuratedItem {
  headline: string;
  body?: string;
  why?: string;
}

export interface CuratedPayload {
  /** Ordered steps (step-sequence keys). */
  steps?: CuratedItem[];
  /** Unordered teaching items (tip-list keys). */
  items?: CuratedItem[];
  dos?: string[];
  donts?: string[];
  intro?: string;
}

function normaliseItems(raw: unknown): CuratedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const headline = typeof o.headline === "string" ? o.headline : "";
      return {
        headline,
        body: typeof o.body === "string" ? o.body : undefined,
        why: typeof o.why === "string" ? o.why : undefined,
      };
    })
    .filter((i) => i.headline.trim().length > 0);
}

function normaliseStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

/** Read a published curated content payload. Returns null when nothing is
 *  published for the key yet — callers must render nothing in that case. */
export function useCuratedContent(key: CuratedKey) {
  return useQuery({
    queryKey: ["curated-content", key],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CuratedPayload | null> => {
      const { data, error } = await supabase
        .from("curated_content")
        .select("payload")
        .eq("content_key", key)
        .eq("status", "published")
        .maybeSingle();
      if (error || !data?.payload) return null;
      const p = data.payload as Record<string, unknown>;
      const payload: CuratedPayload = {
        steps: normaliseItems(p.steps),
        items: normaliseItems(p.items),
        dos: normaliseStrings(p.dos),
        donts: normaliseStrings(p.donts),
        intro: typeof p.intro === "string" ? p.intro : undefined,
      };
      const empty =
        (payload.steps?.length ?? 0) === 0 && (payload.items?.length ?? 0) === 0;
      return empty ? null : payload;
    },
  });
}
