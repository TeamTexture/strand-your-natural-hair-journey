import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useBrandSubscription } from "@/hooks/useBrandSubscription";

/**
 * Brand paywall status.
 *
 * `locked` is true for a signed-in brand account (with no professional or
 * admin role) whose paid status cannot be established. Paid status comes only
 * from the `brand_subscriptions` record written by the Stripe webhook, or the
 * admin-set complimentary access flag — never from a URL parameter or a
 * client-side flag set on returning from Checkout.
 */
export function useBrandLockout() {
  const { session } = useAuth();
  const { isBrand, isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const { isActive, isLoading: subLoading } = useBrandSubscription();

  const loading = rolesLoading || subLoading;
  const isBrandOnly = !!session && isBrand && !isProfessional && !isAdmin;

  return {
    loading,
    isBrandOnly,
    locked: isBrandOnly && !loading && !isActive,
  };
}
