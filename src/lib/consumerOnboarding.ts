import { supabase } from "@/integrations/supabase/client";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
export const POST_PAYMENT_ANALYSIS_PATH = "/onboarding/blood-ai-summary";
export const BRAND_ACCESS_PATH = "/brand/subscribe";

export const getSubscribePath = (next = POST_PAYMENT_ANALYSIS_PATH) =>
  `/subscribe?next=${encodeURIComponent(next)}`;

export const isSafeInternalPath = (path: string | null | undefined): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

export async function getConsumerOnboardingStatus(userId: string) {
  const [profileRes, healthRes, hairRes, styleRes, bloodResultsRes, bloodPanelsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed_at, avatar_url, display_name, phone_number, birth_year, postcode, country")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_health_profile")
      .select("life_stage_enc, contraception_enc, medical_conditions_enc, diet, diet_balance, smoke, alcohol, daily_water, exercise, sleep_quality")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_hair_profile")
      .select("diameter, surface_texture, density, porosity, elasticity, scalp_condition_enc, diagnosed_conditions_enc, areas_of_concern")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_style_profile")
      .select("current_colour_status, current_hairstyle, style_set_at, default_styles")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("blood_results")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "logged"),
    supabase
      .from("blood_panels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const profile = profileRes.data;
  const health = healthRes.data;
  const hair = hairRes.data;
  const style = styleRes.data;
  const basicComplete = !!(
    profile?.avatar_url && profile.display_name?.trim() && profile.phone_number?.trim() &&
    profile.birth_year && profile.postcode?.trim() && profile.country?.trim()
  );
  const healthComplete = !!(
    health?.life_stage_enc && health.contraception_enc && health.medical_conditions_enc &&
    health.diet && health.diet_balance && health.smoke && health.alcohol &&
    health.daily_water && health.exercise && health.sleep_quality
  );
  const hairComplete = !!(
    hair?.diameter && hair.surface_texture && hair.density && hair.porosity &&
    hair.elasticity && hair.scalp_condition_enc && hair.diagnosed_conditions_enc &&
    Array.isArray(hair.areas_of_concern) && hair.areas_of_concern.length > 0
  );
  const styleComplete = !!(
    style?.current_colour_status && style.current_hairstyle && style.style_set_at &&
    Array.isArray(style.default_styles) && style.default_styles.length > 0
  );
  const bloodOnFile = (bloodResultsRes.count ?? 0) > 0 && (bloodPanelsRes.count ?? 0) > 0;
  const dataComplete = basicComplete && healthComplete && hairComplete && styleComplete && bloodOnFile;
  const markedComplete = !!profile?.onboarding_completed_at;

  if (dataComplete && !markedComplete) {
    void supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  // Where a part-way user should be dropped back in, so returning mid-flow
  // never restarts the whole journey from step 1.
  let resumePath = "/onboarding/profile-step-1";
  if (basicComplete) resumePath = "/onboarding/profile-step-2";
  if (healthComplete) resumePath = "/onboarding/profile-step-3-hair";
  if (hairComplete) resumePath = "/onboarding/profile-step-4-colour";
  if (styleComplete) resumePath = "/onboarding/blood-timing";

  // Blood data on file is NOT a payment checkpoint on its own — members often
  // upload bloods before finishing their hair/style profile, and blocking them
  // there left them stranded mid-onboarding. Payment is only due once the whole
  // onboarding data set is captured; the paywall on /home catches the rest.
  return {
    completed: dataComplete,
    markedComplete,
    dataComplete,
    basicComplete,
    healthComplete,
    hairComplete,
    styleComplete,
    bloodOnFile,
    paymentDue: dataComplete,

    resumePath,
    analysisPath: POST_PAYMENT_ANALYSIS_PATH,
  };
}

export async function getConsumerAccessForUser(userId: string, roles: string[] = []) {
  if (roles.includes("admin") || roles.includes("professional")) return true;
  if (roles.includes("brand")) return false;

  const [profileRes, subRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("complimentary_access")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("consumer_subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const complimentary = !!(profileRes.data as { complimentary_access?: boolean } | null)?.complimentary_access;
  const subscription = subRes.data as { status?: string | null; current_period_end?: string | null } | null;
  const stripeActive =
    !!subscription?.status &&
    ACTIVE_STATUSES.has(subscription.status) &&
    (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());

  return complimentary || stripeActive;
}

export async function getBrandAccessForUser(userId: string, roles: string[] = []) {
  if (roles.includes("admin")) return true;

  // Complimentary accounts always have Brand Access.
  const compRes = await supabase
    .from("profiles")
    .select("complimentary_access")
    .eq("user_id", userId)
    .maybeSingle();
  if ((compRes.data as { complimentary_access?: boolean } | null)?.complimentary_access) return true;


  const { data } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: { status?: string | null; current_period_end?: string | null } | null;
            error: unknown;
          }>;
        };
      };
    };
  })
    .from("brand_subscriptions")
    .select("status, current_period_end")
    .eq("brand_user_id", userId)
    .maybeSingle();

  return !!(
    data?.status &&
    ACTIVE_STATUSES.has(data.status) &&
    (!data.current_period_end || new Date(data.current_period_end) > new Date())
  );
}

export async function getBrandEntryPath(userId: string, roles: string[] = []) {
  const hasAccess = await getBrandAccessForUser(userId, roles);
  return hasAccess ? "/brand" : BRAND_ACCESS_PATH;
}