import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WashDay {
  id: string;
  wash_date: string;
  steps: Array<{ name: string; product_id?: string; product_name?: string }>;
  heat_treatment: { product?: string; duration_min?: number } | null;
  scalp_feel: string | null;
  breakage: string | null;
  hair_feel_note: string | null;
  hair_feel_voice_url: string | null;
  style_after: string | null;
  duration_min: number | null;
  stress_level: number | null;
  ai_insight: string | null;
  next_wash_tip: string | null;
  product_ids: string[];
  created_at: string;
}

export function useWashDays() {
  const { user } = useAuth();
  const [washDays, setWashDays] = useState<WashDay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setWashDays([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("wash_days")
      .select("*")
      .eq("user_id", user.id)
      .order("wash_date", { ascending: false });
    if (error) console.error("wash_days load failed", error);
    setWashDays((data as unknown as WashDay[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Realtime — keep the list (and thus the calendar + monthly count) in sync
  // whenever the user inserts/updates/deletes a wash day in any tab.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`wash_days:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wash_days", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);

  const last = washDays[0] ?? null;
  const daysSinceLast = last
    ? Math.floor((Date.now() - new Date(last.wash_date).getTime()) / 86_400_000)
    : null;

  return { washDays, last, daysSinceLast, loading, reload: load };
}
