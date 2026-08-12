// Server-side entitlement gate for paid AI work.
//
// A lapsed member still holds a valid JWT, so authentication alone does not
// protect the AI budget. Every function that makes a paid model call runs this
// first. It mirrors `src/lib/entitlement.ts`.
//
// Entitled = active/trialing subscription (or a paid period that has not run
// out yet), OR complimentary access, OR an admin/professional role. Brand
// accounts are entitled only where a function is explicitly brand-facing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { json } from "./cors.ts";
import { requireAuthedUser, isServiceRoleCaller, type AuthSuccess } from "./auth.ts";

const ACTIVE = new Set(["active", "trialing"]);
const GRACE = new Set(["past_due", "canceled", "cancelled"]);

export function subscriptionGrantsAccess(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
): boolean {
  if (!status) return false;
  const periodLive = !!currentPeriodEnd && new Date(currentPeriodEnd) > new Date();
  if (ACTIVE.has(status)) return !currentPeriodEnd || periodLive;
  if (GRACE.has(status)) return periodLive;
  return false;
}

export interface EntitlementOptions {
  /** Allow brand accounts through (brand-facing AI surfaces only). */
  allowBrand?: boolean;
}

export async function isEntitled(
  userId: string,
  opts: EntitlementOptions = {},
): Promise<boolean> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [{ data: roles }, { data: profile }, { data: sub }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId),
    admin.from("profiles").select("complimentary_access").eq("user_id", userId).maybeSingle(),
    admin
      .from("consumer_subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const roleSet = new Set(((roles ?? []) as { role: string }[]).map((r) => r.role));
  if (roleSet.has("admin") || roleSet.has("professional")) return true;
  if (opts.allowBrand && roleSet.has("brand")) return true;
  if ((profile as { complimentary_access?: boolean } | null)?.complimentary_access) return true;

  const row = sub as { status?: string; current_period_end?: string | null } | null;
  return subscriptionGrantsAccess(row?.status, row?.current_period_end ?? null);
}

/** The 402 body a lapsed member gets back. */
export function membershipRequired(): Response {
  return json(402, {
    error: "membership_required",
    message: "Your STRAND membership has ended. Resubscribe to continue.",
  });
}

/**
 * Returns `{ user, supabase }` for an entitled member, or a `Response`
 * (401 / 402) the caller should return directly.
 */
export async function requireEntitledUser(
  req: Request,
  opts: EntitlementOptions = {},
): Promise<AuthSuccess | Response> {
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  if (!(await isEntitled(auth.user.id, opts))) return membershipRequired();
  return auth;
}

/**
 * Same, but lets a trusted service-role caller through (returns `null`) — used
 * by functions that are also invoked server-to-server, e.g. pre-generation.
 */
export async function requireEntitledServiceOrUser(
  req: Request,
  opts: EntitlementOptions = {},
): Promise<AuthSuccess | null | Response> {
  if (isServiceRoleCaller(req)) return null;
  return await requireEntitledUser(req, opts);
}

