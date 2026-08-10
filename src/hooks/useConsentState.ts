import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { supabase } from "@/integrations/supabase/client";
import {
  ConsentKey,
  ConsentRole,
  ConsentRow,
  ConsentView,
  fetchConsentRows,
  latestByKey,
  mandatoryKeysForView,
  optionalKeysForView,
  outstandingMandatory,
  resolveConsentView,
  unansweredOptional,
} from "@/lib/consent";

export const consentKey = (userId?: string) => ["user-consents", userId] as const;

/**
 * Current consent state for the signed-in user, derived from the append-only
 * user_consents table. Nothing is ever assumed granted — a member with no rows
 * is outstanding on every mandatory key for the view they are in.
 *
 * SCOPING: requirements follow the ACTIVE VIEW (My STRAND / professional /
 * brand / admin), never the union of the account's roles. That is what keeps
 * the professional undertaking out of the end user side and the medical
 * disclaimer out of the brand side for a multi-role account.
 */
export function useConsentState() {
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const activeView = useActiveRoleView();
  const q = useQuery({
    queryKey: consentKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchConsentRows(user!.id),
  });

  // A brand new professional or brand does NOT hold their role yet — it is
  // granted on approval. Without this, they fall back to the member matrix and
  // get asked for health-data consent, which they must never be asked for.
  const pending = useQuery({
    queryKey: ["consent-pending-views", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ConsentView[]> => {
      const [app, brand] = await Promise.all([
        supabase.from("pro_applications").select("id").eq("user_id", user!.id).limit(1),
        supabase.from("brand_profiles").select("id").eq("user_id", user!.id).limit(1),
      ]);
      const out: ConsentView[] = [];
      const meta = (user!.user_metadata ?? {}) as Record<string, unknown>;
      // Sign-up intent counts: a pro or brand who has only just created their
      // account has no application/profile row yet, and must still never be
      // asked for member-only consents such as health data.
      if ((app.data ?? []).length || meta.pro_intent === true) out.push("pro");
      if ((brand.data ?? []).length || meta.brand_intent === true) out.push("brand");
      return out;
    },

  });

  const rows: ConsentRow[] = q.data ?? [];
  const consentRoles = roles as ConsentRole[];
  // Clamp the remembered/route view to a view this account may actually enter.
  const view: ConsentView = resolveConsentView(
    activeView as ConsentView,
    consentRoles,
    pending.data ?? [],
  );
  const latest = latestByKey(rows);
  const gateLoading = rolesLoading || pending.isLoading;
  const outstanding = gateLoading ? [] : outstandingMandatory(rows, view);
  // Only optional items that have NEVER been answered are still outstanding.
  const optionalOutstanding = gateLoading ? [] : unansweredOptional(rows, view);

  const isGranted = (key: ConsentKey) => !!latest[key]?.granted;

  return {
    rows,
    latest,
    outstanding,
    isGranted,
    roles: consentRoles,
    /** The view these requirements were resolved for. */
    view,
    mandatoryKeys: mandatoryKeysForView(view),
    /** Every optional key offered in this view (answered or not). */
    optionalKeys: optionalKeysForView(view),
    /** Optional keys still genuinely unanswered — the only ones safe to ask for. */
    optionalOutstanding,
    needsConsent:
      !!user && !q.isLoading && !gateLoading && !q.isError && outstanding.length > 0,
    isLoading: q.isLoading || gateLoading,
    refetch: q.refetch,
  };
}
