import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { consentKey } from "@/hooks/useConsentState";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import {
  fetchConsentRows,
  latestByKey,
  PRO_UNDERTAKING_KEY,
  recordConsents,
} from "@/lib/consent";

const DISMISS_KEY = "pro_undertaking_dismissed";

/**
 * PROFESSIONAL DATA HANDLING UNDERTAKING.
 *
 * Deliberately NOT part of the initial login consent gate. It is presented on
 * entering the professional view, never blocks the professional side, and gates
 * client passport access only — enforced server-side inside
 * public.has_active_client_access().
 *
 * VIEW SCOPED: it may only ever be prompted while the account is inside the
 * professional view. It can never surface in My STRAND, the brand view or the
 * admin view, even for an account holding all four roles.
 */
export function useProUndertaking() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const view = useActiveRoleView();

  const q = useQuery({
    queryKey: consentKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchConsentRows(user!.id),
  });

  const latest = latestByKey(q.data ?? []);
  const accepted = !!latest[PRO_UNDERTAKING_KEY]?.granted;

  const dismissedThisSession = () =>
    typeof window !== "undefined" && window.sessionStorage.getItem(DISMISS_KEY) === "1";

  return {
    accepted,
    isLoading: q.isLoading,
    /** Should the undertaking be offered unprompted on entering the pro view? */
    /** The professional view is the only place this may be offered. */
    inProView: view === "pro",
    shouldPrompt:
      view === "pro" &&
      !!user &&
      !q.isLoading &&
      !q.isError &&
      !accepted &&
      !dismissedThisSession(),
    dismiss: () => {
      if (typeof window !== "undefined") window.sessionStorage.setItem(DISMISS_KEY, "1");
    },
    accept: async () => {
      await recordConsents({ [PRO_UNDERTAKING_KEY]: true }, "pro_entry");
      await qc.invalidateQueries({ queryKey: consentKey(user?.id) });
    },
  };
}
