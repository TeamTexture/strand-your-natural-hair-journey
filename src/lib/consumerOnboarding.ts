import { supabase } from "@/integrations/supabase/client";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
export const POST_PAYMENT_ANALYSIS_PATH = "/onboarding/blood-ai-summary";
export const BRAND_ACCESS_PATH = "/brand/subscribe";

/**
 * Where a member belongs once payment lands. Blood work is optional, so the
 * analysis screen is only ever a destination when there is something to
 * analyse — otherwise she goes straight into the app.
 */
export const getPostPaymentPath = (bloodOnFile: boolean) =>
  bloodOnFile ? POST_PAYMENT_ANALYSIS_PATH : "/home";

/** The destination is always explicit: no caller can fall back to the analysis screen. */
export const getSubscribePath = (next: string) =>
  `/subscribe?next=${encodeURIComponent(next)}`;


export const isSafeInternalPath = (path: string | null | undefined): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

export async function getConsumerOnboardingStatus(userId: string) {
  const [profileRes, healthRes, hairRes, styleRes, bloodResultsRes, bloodPanelsRes, proRes] = await Promise.all([
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
      .eq("user_id", userId),
    supabase
      .from("blood_panels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    // The professional consultation is arranged off-app, so the only durable
    // evidence it happened is the member's own logged professional + date.
    supabase
      .from("user_professionals")
      .select("consultation_date")
      .eq("user_id", userId)
      .order("consultation_date", { ascending: false })
      .limit(1),
  ]);

  const readError = [
    profileRes.error,
    healthRes.error,
    hairRes.error,
    styleRes.error,
    bloodResultsRes.error,
    bloodPanelsRes.error,
    proRes.error,
  ].find(Boolean);
  // A failed read is not an incomplete profile. Treating a timeout/auth-lock as
  // empty data sent members back to step one and made saved answers appear lost.
  if (readError) throw readError;

  const profile = profileRes.data;
  const health = healthRes.data;
  const hair = hairRes.data;
  const style = styleRes.data;
  const basicComplete = !!(
    profile?.avatar_url && profile.display_name?.trim() && profile.phone_number?.trim() &&
    profile.birth_year && profile.postcode?.trim() && profile.country?.trim()
  );
  const healthFieldsComplete = !!(
    health?.life_stage_enc && health.contraception_enc && health.medical_conditions_enc &&
    health.diet && health.diet_balance && health.smoke && health.alcohol &&
    health.daily_water && health.exercise && health.sleep_quality
  );
  // The six self-answerable questions. diameter/surface_texture/density are
  // asked again on the hair step, but "Not sure" writes null — they must never
  // be required here, or a member who answers "Not sure" to all three is
  // blocked from completing.
  const hairFieldsComplete = !!(
    hair?.porosity &&
    hair.elasticity && hair.scalp_condition_enc && hair.diagnosed_conditions_enc &&
    Array.isArray(hair.areas_of_concern) && hair.areas_of_concern.length > 0
  );
  const styleFieldsComplete = !!(
    style?.current_colour_status && style.current_hairstyle && style.style_set_at &&
    Array.isArray(style.default_styles) && style.default_styles.length > 0
  );
  const markedComplete = !!profile?.onboarding_completed_at;
  // Once a member has finished onboarding, a later edit that clears one optional
  // field (e.g. colour status, default styles) must never re-open the capture
  // flow. onboarding_completed_at is the durable answer; the field checks only
  // drive members who have not finished yet.
  const basicOk = basicComplete || markedComplete;
  const healthComplete = markedComplete || (basicComplete && healthFieldsComplete);
  const hairComplete = markedComplete || (healthComplete && hairFieldsComplete);
  const styleComplete = markedComplete || (hairComplete && styleFieldsComplete);
  const bloodOnFile = (bloodResultsRes.count ?? 0) > 0 && (bloodPanelsRes.count ?? 0) > 0;
  // Consultation: logged professional with a consultation date on file. Kept as
  // information only — it gates nothing.
  const consultationRow = (proRes.data ?? [])[0] as { consultation_date?: string | null } | undefined;
  const consultationComplete = markedComplete || !!consultationRow?.consultation_date;
  // Blood work is OPTIONAL — it gates the diet and nutrition surfaces only,
  // never payment or app access. The professional consultation gates nothing at
  // all now: the hair characteristics (markers + colour/style) are what unlock
  // STRAND, and the member answers them herself.
  const fieldsComplete =
    basicComplete && healthComplete && hairComplete && styleComplete;
  const dataComplete = fieldsComplete || markedComplete;

  if (fieldsComplete && !markedComplete) {
    void supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  // Where a part-way user should be dropped back in, so returning mid-flow
  // never restarts the whole journey from step 1.
  let resumePath = "/onboarding/profile-step-1";
  if (basicOk) resumePath = "/onboarding/profile-step-2";
  if (healthComplete) resumePath = "/onboarding/profile-step-3-hair";
  if (hairComplete) resumePath = "/onboarding/profile-step-4-colour";
  // Blood work is optional, so a member who has finished her hair profile is
  // never dropped into the blood flow as if it were the next requirement.
  if (styleComplete) resumePath = "/onboarding/resume";

  // Where a RETURNING member should land. Once the health profile is in, the
  // remaining pieces (hair characteristics, and optionally blood work) are each
  // done in their own time, so she is offered the outstanding ones rather than
  // dropped into one form.
  const entryPath =
    healthComplete && !dataComplete ? "/onboarding/resume" : resumePath;


  // `bloodOnFile` is reported here but gates NOTHING about access: it is the
  // flag the diet and nutrition surfaces read. Payment becomes due once the
  // required data set (hair characteristics) is captured; the paywall on /home
  // catches the rest.
  return {
    completed: dataComplete,
    markedComplete,
    dataComplete,
    basicComplete: basicOk,
    healthComplete,
    hairComplete,
    styleComplete,
    bloodOnFile,
    consultationComplete,
    paymentDue: dataComplete,

    resumePath,
    entryPath,
    analysisPath: getPostPaymentPath(bloodOnFile),
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