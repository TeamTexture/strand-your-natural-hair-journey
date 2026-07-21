import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Full passport dataset — every stored row for a member.
export interface PassportDataset {
  clientName: string;
  memberSince: string | null;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    birth_year: number | null;
    age: number | null;
    heritage: string[];
    postcode: string | null;
    country: string | null;
    onboarding_completed_at: string | null;
    created_at: string | null;
  } & Record<string, unknown> | null;
  authEmail: string | null;
  hair: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
  professional: Record<string, unknown> | null;
  goals: Array<Record<string, unknown> & { id: string }>;
  goalUpdates: Array<{ id: string; goal_id: string; note: string | null; voice_url: string | null; created_at: string }>;
  bloodPanels: Array<Record<string, unknown> & { id: string; panel_date: string | null; label: string | null; notes: string | null; test_type: string | null; lab_name: string | null; status: string | null }>;
  bloodResults: Array<Record<string, unknown> & { id: string; panel_id: string | null; marker: string; value: number | null; unit: string | null; status: string | null; category: string | null; updated_at: string }>;
  bloodSummaries: Array<{ id: string; payload: unknown; created_at: string }>;
  nutritionSummaries: Array<{ id: string; payload: unknown; created_at: string }>;
  strandSummaries: Array<{ id: string; overview: string | null; action_plan: unknown; routine_tips: unknown; created_at: string }>;
  washDays: Array<Record<string, unknown> & { id: string; wash_date: string }>;
  journal: Array<Record<string, unknown> & { id: string; entry_date: string; title: string | null; note: string | null; mood: string | null; photo_paths: string[] | null; products_used: string[] | null }>;
  shelf: Array<Record<string, unknown> & { id: string; name: string }>;
  productPhotos: Array<Record<string, unknown> & { id: string; product_key: string | null; storage_path: string | null }>;
  productRatings: Array<Record<string, unknown> & { id: string; product_key: string | null; product_name: string | null; rating: number | null; created_at: string }>;
  productVoicenotes: Array<Record<string, unknown> & { id: string; product_key: string | null; product_name: string | null; audio_url: string | null; duration_sec: number | null; transcript: string | null; created_at: string }>;
  appointments: Array<Record<string, unknown> & { id: string; appointment_date: string }>;
  appointmentPhotos: Array<Record<string, unknown> & { id: string; appointment_id: string; storage_path: string; caption: string | null }>;
  medications: Array<Record<string, unknown> & { id: string; name: string | null; category: string | null; created_at: string }>;
  tools: Array<Record<string, unknown> & { id: string; name: string | null }>;
  milestonePhotos: Array<Record<string, unknown> & { id: string; storage_path: string; caption: string | null; taken_on: string | null }>;
  beforePhotos: Array<Record<string, unknown> & { id: string; storage_path: string; caption: string | null; created_at: string }>;
  savedMeals: Array<Record<string, unknown> & { id: string; name: string | null }>;
  moodboards: Array<Record<string, unknown> & { id: string; name: string | null; emoji: string | null; is_favourites: boolean | null; cover_storage_path: string | null }>;
  moodboardImages: Array<Record<string, unknown> & { id: string; board_id: string; storage_path: string; caption: string | null; is_favourite: boolean | null }>;
  ingredientLists: Array<Record<string, unknown> & { id: string; list_kind: string | null; ingredient: string | null; reason: string | null; product_count: number | null; updated_at: string }>;
}

const emptyDataset = (): PassportDataset => ({
  clientName: "Client", memberSince: null,
  profile: null, authEmail: null,
  hair: null, health: null, style: null, professional: null,
  goals: [], goalUpdates: [], bloodPanels: [], bloodResults: [], bloodSummaries: [], nutritionSummaries: [], strandSummaries: [],
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

      const [
        profile, hair, health, style, professional, goals, goalUpdates,
        bloodPanels, bloodResults, bloodSummaries, nutritionSummaries, strandSummaries,
        washDays, journal, shelf, productPhotos, productRatings, productVoicenotes,
        appointments, appointmentPhotos, medications, tools, milestonePhotos, beforePhotos,
        savedMeals, moodboards, moodboardImages, ingredientLists,
        decryptRes, emailRes,
      ] = await Promise.all([
        sb.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_health_profile").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_professionals").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("user_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("goal_updates").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("blood_panels").select("*").eq("user_id", userId).order("panel_date", { ascending: false, nullsFirst: false }),
        sb.from("blood_results").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.from("ai_summaries").select("id, payload, created_at").eq("user_id", userId).eq("kind", "blood_summary").order("created_at", { ascending: false }),
        sb.from("ai_summaries").select("id, payload, created_at").eq("user_id", userId).eq("kind", "nutrition_plan").order("created_at", { ascending: false }),
        sb.from("hair_strand_summaries").select("id, overview, action_plan, routine_tips, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("wash_days").select("*").eq("user_id", userId).order("wash_date", { ascending: false }),
        sb.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }),
        sb.from("user_products").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.from("user_product_photos").select("*").eq("user_id", userId),
        sb.from("product_ratings").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("product_voicenotes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("appointments").select("*").eq("user_id", userId).order("appointment_date", { ascending: false }),
        sb.from("appointment_photos").select("*").eq("user_id", userId),
        sb.from("user_medications").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("user_tools").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.from("user_milestone_photos").select("*").eq("user_id", userId).order("taken_on", { ascending: false, nullsFirst: false }),
        sb.from("user_before_photos").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("user_saved_meals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("moodboards").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("moodboard_images").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        sb.from("ingredient_lists").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        sb.functions.invoke("passport-decrypt", { body: { target_user_id: userId } }).catch(() => ({ data: null })),
        // Admins can read auth emails; pros cannot. Ignore errors.
        sb.rpc("admin_list_member_emails" as never).then(
          (r) => {
            const rows = (r.data ?? []) as Array<{ user_id: string; email: string }>;
            return rows.find((e) => e.user_id === userId)?.email ?? null;
          },
          () => null,
        ),
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
      const p = profile.data as Record<string, unknown> & {
        display_name?: string | null; avatar_url?: string | null; birth_year?: number | null;
        heritage?: string[] | null; postcode?: string | null; country?: string | null;
        onboarding_completed_at?: string | null; created_at?: string | null;
      } | null;

      // Merge decrypted clinical fields into hair/health/professional.
      const dec = (decryptRes as { data?: {
        hair?: { scalp_condition: string | null; diagnosed_conditions: string[] } | null;
        health?: { life_stage: string | null; contraception: string[]; medical_conditions: string[] } | null;
        professional?: { gmc_number: string | null; iot_number: string | null; notes: string | null } | null;
        medications?: Array<{ id: string; name: string | null; category: string | null }>;
      } | null })?.data ?? null;

      const hairMerged = hair.data
        ? { ...(hair.data as Record<string, unknown>), ...(dec?.hair ?? {}) }
        : null;
      const healthMerged = health.data
        ? { ...(health.data as Record<string, unknown>), ...(dec?.health ?? {}) }
        : null;
      const professionalMerged = professional.data
        ? { ...(professional.data as Record<string, unknown>), ...(dec?.professional ?? {}) }
        : null;

      const medsMerged = (medications.data ?? []).map((m) => {
        const decMed = dec?.medications?.find((x) => x.id === (m as { id: string }).id);
        return {
          ...(m as Record<string, unknown>),
          id: (m as { id: string }).id,
          name: decMed?.name ?? (m as { name?: string | null }).name ?? null,
          category: decMed?.category ?? (m as { category?: string | null }).category ?? null,
          created_at: (m as { created_at: string }).created_at,
        };
      });

      const currentYear = new Date().getFullYear();
      const age = p?.birth_year ? currentYear - p.birth_year : null;

      setData({
        ...emptyDataset(),
        clientName: p?.display_name || "Client",
        memberSince: p?.created_at ?? null,
        profile: p ? {
          ...p,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
          birth_year: p.birth_year ?? null,
          age,
          heritage: p.heritage ?? [],
          postcode: p.postcode ?? null,
          country: p.country ?? null,
          onboarding_completed_at: p.onboarding_completed_at ?? null,
          created_at: p.created_at ?? null,
        } : null,
        authEmail: (emailRes as string | null) ?? null,
        hair: hairMerged,
        health: healthMerged,
        style: style.data as Record<string, unknown> | null,
        professional: professionalMerged,
        goals: asArray(goals),
        goalUpdates: asArray(goalUpdates),
        bloodPanels: asArray(bloodPanels),
        bloodResults: asArray(bloodResults),
        bloodSummaries: asArray(bloodSummaries),
        nutritionSummaries: asArray(nutritionSummaries),
        strandSummaries: asArray(strandSummaries),
        washDays: asArray(washDays),
        journal: asArray(journal),
        shelf: asArray(shelf),
        productPhotos: asArray(productPhotos),
        productRatings: asArray(productRatings),
        productVoicenotes: asArray(productVoicenotes),
        appointments: asArray(appointments),
        appointmentPhotos: asArray(appointmentPhotos),
        medications: medsMerged,
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
