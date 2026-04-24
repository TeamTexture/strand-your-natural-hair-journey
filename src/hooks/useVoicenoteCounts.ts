import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns a map of `product_key -> number of voicenotes` for the current user.
 * Used to show a small "🎙 N" badge on product cards so users know notes exist
 * without having to expand each row.
 */
export function useVoicenoteCounts(productKeys: string[]) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Stable key string so the effect only re-runs when the set of products changes
  const keysSig = productKeys.slice().sort().join("|");

  useEffect(() => {
    if (!user || productKeys.length === 0) {
      setCounts({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("product_voicenotes")
        .select("product_key")
        .eq("user_id", user.id)
        .in("product_key", productKeys);
      if (cancelled) return;
      if (error) {
        console.error("Voicenote count failed:", error);
        setCounts({});
      } else {
        const out: Record<string, number> = {};
        for (const row of data ?? []) {
          out[row.product_key] = (out[row.product_key] ?? 0) + 1;
        }
        setCounts(out);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, keysSig]);

  return { counts, loading };
}
