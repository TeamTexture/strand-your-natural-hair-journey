// Between-wash-day entries — the small things a member does most days
// (rehydrating spritz, leave-in, refresh, oiling the scalp).
//
// These are NOT wash days. `wash_days` is untouched, so "days since last wash",
// the calendar, the monthly count and every AI surface reading wash history
// keep behaving exactly as before. What IS shared is the product record: the
// insert trigger bumps `user_products.last_used_at` / `use_count`, the same
// fields a wash day writes, so her shelf and the wash-day log read one history.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { localIsoDate } from "@/lib/washLogSteps";

export interface DailyHairEntry {
  id: string;
  entry_date: string;
  entry_at: string;
  product_ids: string[];
  note: string | null;
  voice_path: string | null;
  created_at: string;
}

export interface NewDailyHairEntry {
  entry_date: string;
  entry_at: string;
  product_ids: string[];
  note?: string | null;
  voice_path?: string | null;
}

/** Newest first. Everything the member has logged between wash days. */
export function useDailyHairEntries() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["daily-hair-entries", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DailyHairEntry[]> => {
      const { data, error } = await supabase
        .from("daily_hair_entries")
        .select("id, entry_date, entry_at, product_ids, note, voice_path, created_at")
        .eq("user_id", user!.id)
        .order("entry_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as DailyHairEntry[];
    },
  });

  const entries = query.data ?? [];
  const today = localIsoDate();

  const todaysEntries = useMemo(
    () => entries.filter((e) => e.entry_date === today),
    [entries, today],
  );

  /** Product ids she reaches for between washes, most recent first. */
  const recentProductIds = useMemo(() => {
    const seen: string[] = [];
    for (const e of entries) {
      for (const id of e.product_ids ?? []) {
        if (!seen.includes(id)) seen.push(id);
      }
      if (seen.length >= 8) break;
    }
    return seen;
  }, [entries]);

  return { ...query, entries, todaysEntries, recentProductIds };
}

/** Entries logged strictly after the given wash date (inclusive of same day). */
export function entriesSince(
  entries: DailyHairEntry[],
  sinceIsoDate: string | null,
): DailyHairEntry[] {
  if (!sinceIsoDate) return entries;
  return entries.filter((e) => e.entry_date >= sinceIsoDate);
}

export function useCreateDailyHairEntry() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: NewDailyHairEntry) => {
      if (!user) throw new Error("Please sign in first.");
      const { data, error } = await supabase
        .from("daily_hair_entries")
        .insert({ ...entry, user_id: user.id } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-hair-entries", user?.id] });
    },
  });
}
