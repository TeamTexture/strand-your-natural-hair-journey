import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normaliseInciKey } from "@/lib/inci";

/**
 * NEVER TOKENISE — everyday English words that also exist as a glossary
 * display name or alias. "Actives" carries the alias "active", so every
 * "active ingredient", "stay active", "active phase" in prose was turning
 * into a tappable chip. A term only earns a chip when the word itself is
 * technical; a word that reads as ordinary English in a sentence does not.
 */
const TOKEN_STOPLIST = new Set([
  "active", "actives", "acid", "acids", "base", "bases", "balance", "barrier",
  "build", "buildup", "build-up", "clean", "clear", "coat", "coating", "cold",
  "colour", "color", "cool", "cover", "damage", "damp", "dense", "dry",
  "fine", "free", "gentle", "hard", "heat", "heavy", "hold", "light", "mild",
  "natural", "naturals", "neutral", "rich", "rinse", "seal", "shine", "slip",
  "smooth", "soft", "strong", "thick", "warm", "wash", "water", "weight",
  "wet", "product", "products", "treatment", "treatments", "volume",
]);

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
  /** Shared definition — present once the term has been generated. */
  what_it_is: string | null;
  category: string | null;
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
        .select(
          "id, inci_key, display_name, phonetic, aliases, is_common, kind, class_category, match_keywords, what_it_is, category",
        );
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

  const tokenNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      if (row.is_common) continue;
      for (const form of [row.display_name, ...(row.aliases ?? [])]) {
        const text = (form ?? "").trim();
        if (text.length < 4) continue;
        const lower = text.toLowerCase();
        // Single everyday words are never chips, however they were indexed.
        if (!lower.includes(" ") && TOKEN_STOPLIST.has(lower)) continue;
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(text);
      }
    }
    return out.sort((a, b) => b.length - a.length).slice(0, 600);
  }, [rows]);


  /**
   * PROSE TERMS — the list used by `GlossaryRichText` for the standing
   * bold+tappable treatment in generated analysis copy. Same closed vocabulary
   * and same stoplist as `tokenNames`, but hair-science concepts and ingredient
   * families are listed FIRST so the length cap can never drop short taught
   * words like "cuticle", "sebum" or "porosity" behind 600 long molecule names.
   */
  const proseTermNames = useMemo(() => {
    const seen = new Set<string>();
    const concepts: string[] = [];
    const molecules: string[] = [];
    for (const row of rows) {
      if (row.is_common) continue;
      const bucket = row.kind === "molecule" ? molecules : concepts;
      for (const form of [row.display_name, ...(row.aliases ?? [])]) {
        const text = (form ?? "").trim();
        if (text.length < 4) continue;
        const lower = text.toLowerCase();
        if (!lower.includes(" ") && TOKEN_STOPLIST.has(lower)) continue;
        if (seen.has(lower)) continue;
        seen.add(lower);
        bucket.push(text);
      }
    }
    const byLength = (a: string, b: string) => b.length - a.length;
    return [...concepts.sort(byLength), ...molecules.sort(byLength).slice(0, 700)];
  }, [rows]);

  const lookup = (name: string) => byKey.get(normaliseInciKey(name)) ?? null;

  return { rows, byKey, tokenNames, proseTermNames, lookup, isLoading: query.isLoading };
}

