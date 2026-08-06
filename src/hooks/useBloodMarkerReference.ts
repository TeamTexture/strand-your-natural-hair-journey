import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildLexicon,
  SUPPRESS_LEXICON,
  type MarkerLexicon,
  type MarkerRefRow,
} from "@/lib/bloodGuardrail";

/** Curated blood marker reference rows (publicly readable). */
export function useBloodMarkerReference() {
  const query = useQuery({
    queryKey: ["blood-marker-reference"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MarkerRefRow[]> => {
      const { data, error } = await supabase
        .from("blood_marker_reference")
        .select("marker, display_name, hair_link_status, hair_link_summary")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as MarkerRefRow[];
    },
  });
  return { rows: query.data ?? [], loading: query.isLoading };
}

/** The render-time lexicon used by the inline AI-copy renderer. Falls back to
 *  suppress mode (drop every blood/hair sentence) until the table loads. */
export function useBloodMarkerLexicon(): MarkerLexicon {
  const { rows } = useBloodMarkerReference();
  if (!rows.length) return SUPPRESS_LEXICON;
  return buildLexicon(rows);
}
