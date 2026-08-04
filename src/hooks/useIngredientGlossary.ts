import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normaliseInciKey } from "@/lib/inci";

export type GlossaryKind = "molecule" | "class" | "concept";

export interface GlossaryRow {
  id: string;
  inci_key: string;
  display_name: string;
  phonetic: string | null;
  aliases: string[] | null;
  is_common: boolean | null;
  kind: GlossaryKind;
  class_category: string | null;
  match_keywords: string[] | null;
}


/**
 * LAYER 1 — the shared glossary.
 *
 * One row per term, generated once ever and reused by every user, so the
 * explainer sheet opens instantly for anything already indexed. Three kinds of
 * term live here:
 *   molecule — a single INCI entry ("Amodimethicone")
 *   class    — an ingredient family ("humectants", "ceramides", "silicones")
 *   concept  — a hair-science idea ("porosity", "cuticle", "sebum")
 * All three are tappable in prose. Cached for the session: the glossary only
 * grows, it never changes under a user.
 */
export function useIngredientGlossary() {
  const query = useQuery({
    queryKey: ["glossary-terms"],
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 4,
    queryFn: async (): Promise<GlossaryRow[]> => {
      const { data, error } = await supabase
        .from("glossary_terms")
        .select("id, inci_key, display_name, phonetic, aliases, is_common, kind, class_category, match_keywords");
      if (error) throw error;
      return (data ?? []) as unknown as GlossaryRow[];
    },
  });

  const rows = query.data ?? [];

  /** inci_key (and every alias key) → glossary row. */
  const byKey = useMemo(() => {
    const map = new Map<string, GlossaryRow>();
    for (const row of rows) {
      map.set(row.inci_key, row);
      for (const alias of row.aliases ?? []) {
        const key = normaliseInciKey(alias);
        if (key && !map.has(key)) map.set(key, row);
      }
    }
    return map;
  }, [rows]);

  /**
   * Surface forms worth tokenising inside prose, longest first so greedy
   * matching wins. Common everyday ingredients (water, fragrance, citric acid)
   * are never tokenised — tapping them teaches nothing.
   */
  const tokenNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      if (row.is_common) continue;
      for (const form of [row.display_name, ...(row.aliases ?? [])]) {
        const text = (form ?? "").trim();
        if (text.length < 4) continue;
        const lower = text.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(text);
      }
    }
    return out.sort((a, b) => b.length - a.length).slice(0, 600);
  }, [rows]);

  const lookup = (name: string) => byKey.get(normaliseInciKey(name)) ?? null;

  return { rows, byKey, tokenNames, lookup, isLoading: query.isLoading };
}
