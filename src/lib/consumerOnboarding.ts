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
      .select("onboarding_completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_health_profile")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("user_hair_profile")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("user_style_profile")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("blood_results")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("blood_panels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const markedComplete = !!(
    profileRes.data as { onboarding_completed_at?: string | null } | null
  )?.onboarding_completed_at;
  const dataComplete =
    (healthRes.count ?? 0) > 0 &&
    (hairRes.count ?? 0) > 0 &&
    (styleRes.count ?? 0) > 0 &&
    ((bloodResultsRes.count ?? 0) > 0 || (bloodPanelsRes.count ?? 0) > 0);

  if (dataComplete && !markedComplete) {
    void supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  return {
    completed: markedComplete || dataComplete,
    markedComplete,
    dataComplete,
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