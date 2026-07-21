import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Full passport dataset — every stored row for a member.
export interface PassportDataset {
  clientName: string;
  memberSince: string | null;
  hair: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
  goals: Array<Record<string, unknown> & { id: string }>;
  goalUpdates: Array<{ id: string; goal_id: string; note: string | null; voice_url: string | null; created_at: string }>;
  bloodPanels: Array<{ id: string; panel_date: string | null; label: string | null; notes: string | null; test_type: string | null; lab_name: string | null; status: string | null }>;
  bloodResults: Array<{ id: string; panel_id: string | null; marker: string; value: number | null; unit: string | null; status: string | null; category: string | null; updated_at: string }>;
  bloodSummaries: Array<{ id: string; payload: unknown; created_at: string }>;
  strandSummaries: Array<{ id: string; overview: string | null; action_plan: unknown; routine_tips: unknown; created_at: string }>;
  washDays: Array<Record<string, unknown> & { id: string; wash_date: string }>;
  journal: Array<{ id: string; entry_date: string; title: string | null; note: string | null; mood: string | null; photo_paths: string[] | null; products_used: string[] | null }>;
  shelf: Array<Record<string, unknown> & { id: string; name: string }>;
  productPhotos: Array<{ id: string; product_key: string | null; storage_path: string | null }>;
  productRatings: Array<{ id: string; product_key: string | null; product_name: string | null; rating: number | null; created_at: string }>;
  productVoicenotes: Array<{ id: string; product_key: string | null; product_name: string | null; audio_url: string | null; duration_sec: number | null; transcript: string | null; created_at: string }>;
  appointments: Array<Record<string, unknown> & { id: string; appointment_date: string }>;
  appointmentPhotos: Array<{ id: string; appointment_id: string; storage_path: string; caption: string | null }>;
  medications: Array<{ id: string; name: string | null; category: string | null; created_at: string }>;
  tools: Array<Record<string, unknown> & { id: string; name: string | null }>;
  milestonePhotos: Array<{ id: string; storage_path: string; caption: string | null; taken_on: string | null }>;
  beforePhotos: Array<{ id: string; storage_path: string; caption: string | null; created_at: string }>;
  savedMeals: Array<Record<string, unknown> & { id: string; name: string | null }>;
  moodboards: Array<{ id: string; name: string | null; emoji: string | null; is_favourites: boolean | null; cover_storage_path: string | null }>;
  moodboardImages: Array<{ id: string; board_id: string; storage_path: string; caption: string | null; is_favourite: boolean | null }>;
  ingredientLists: Array<{ id: string; list_kind: string | null; ingredient: string | null; reason: string | null; product_count: number | null; updated_at: string }>;
}

const emptyDataset = (): PassportDataset => ({
  clientName: "Client", memberSince: null,
  hair: null, health: null, style: null,
  goals: [], goalUpdates: [], bloodPanels: [], bloodResults: [], bloodSummaries: [], strandSummaries: [],
  washDays: [], journal: [], shelf: [], productPhotos: [], productRatings: [], productVoicenotes: [],
  appointments: [], appointmentPhotos: [], medications: [], tools: [], milestonePhotos: [], beforePhotos: [],
  savedMeals: [], moodboards: [], moodboardImages: [], ingredientLists: [],
});

export const usePassportData = (userId: string | undefined, active: boolean) => {
  const [data, setData] = useState<PassportDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessEnded, setAccessEnded] = useState(false);

  useEffect(() => {
    if (!userId || !active) return;
    let cancelled = false;
    setLoading(true);
    setAccessEnded(false);
    (async () => {
      const sb = supabase;
      const eq = (t: string, cols = "*") =>
        (sb.from(t as never) as never as { select: (c: string) => { eq: (k: string, v: string) => { order: (k: string, o?: unknown) => Promise<{ data: unknown[] | null }> } } })
          .select(cols)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

      const [
        profile, hair, health, style, goals, goalUpdates,
        bloodPanels, bloodResults, bloodSummaries, strandSummaries,
        washDays, journal, shelf, productPhotos, productRatings, productVoicenotes,
        appointments, appointmentPhotos, medications, tools, milestonePhotos, beforePhotos,
        savedMeals, moodboards, moodboardImages, ingredientLists,
      ] = await Promise.all([
        sb.from("profiles").select("display_name, created_at").eq("user_id", userId).maybeSingle(),
        sb.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("goal_updates").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("blood_panels").select("*").eq("user_id", userId).order("panel_date", { ascending: false, nullsFirst: false }),
        sb.from("blood_results").select("id, panel_id, marker, value, unit, status, category, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.from("ai_summaries").select("id, payload, created_at").eq("user_id", userId).eq("kind", "blood").order("created_at", { ascending: false }),
        sb.from("hair_strand_summaries").select("id, overview, action_plan, routine_tips, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("wash_days").select("*").eq("user_id", userId).order("wash_date", { ascending: false }),
        sb.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }),
        sb.from("user_products").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.from("user_product_photos").select("id, product_key, storage_path").eq("user_id", userId),
        sb.from("product_ratings").select("id, product_key, product_name, rating, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("product_voicenotes").select("id, product_key, product_name, audio_url, duration_sec, transcript, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("appointments").select("*").eq("user_id", userId).order("appointment_date", { ascending: false }),
        sb.from("appointment_photos").select("id, appointment_id, storage_path, caption").eq("user_id", userId),
        sb.from("user_medications").select("id, name, category, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("user_tools").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.from("user_milestone_photos").select("id, storage_path, caption, taken_on").eq("user_id", userId).order("taken_on", { ascending: false, nullsFirst: false }),
        sb.from("user_before_photos").select("id, storage_path, caption, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("user_saved_meals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("moodboards").select("id, name, emoji, is_favourites, cover_storage_path").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("moodboard_images").select("id, board_id, storage_path, caption, is_favourite").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("ingredient_lists").select("id, list_kind, ingredient, reason, product_count, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const noAccess =
        !profile.data && !hair.data && !health.data && !style.data
        && (goals.data ?? []).length === 0 && (washDays.data ?? []).length === 0
        && (appointments.data ?? []).length === 0 && (journal.data ?? []).length === 0
        && (shelf.data ?? []).length === 0;

      if (noAccess) {
        setAccessEnded(true);
        setData(null);
        setLoading(false);
        return;
      }

      const asArray = <T,>(r: { data: unknown[] | null }): T[] => (r.data ?? []) as T[];
      const p = profile.data as { display_name?: string | null; created_at?: string | null } | null;

      setData({
        ...emptyDataset(),
        clientName: p?.display_name || "Client",
        memberSince: p?.created_at ?? null,
        hair: hair.data as Record<string, unknown> | null,
        health: health.data as Record<string, unknown> | null,
        style: style.data as Record<string, unknown> | null,
        goals: asArray(goals),
        goalUpdates: asArray(goalUpdates),
        bloodPanels: asArray(bloodPanels),
        bloodResults: asArray(bloodResults),
        bloodSummaries: asArray(bloodSummaries),
        strandSummaries: asArray(strandSummaries),
        washDays: asArray(washDays),
        journal: asArray(journal),
        shelf: asArray(shelf),
        productPhotos: asArray(productPhotos),
        productRatings: asArray(productRatings),
        productVoicenotes: asArray(productVoicenotes),
        appointments: asArray(appointments),
        appointmentPhotos: asArray(appointmentPhotos),
        medications: asArray(medications),
        tools: asArray(tools),
        milestonePhotos: asArray(milestonePhotos),
        beforePhotos: asArray(beforePhotos),
        savedMeals: asArray(savedMeals),
        moodboards: asArray(moodboards),
        moodboardImages: asArray(moodboardImages),
        ingredientLists: asArray(ingredientLists),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, active]);

  return { data, loading, accessEnded };
};
