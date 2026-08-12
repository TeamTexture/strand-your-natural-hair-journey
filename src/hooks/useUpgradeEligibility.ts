import { useRoles } from "@/hooks/useRoles";
import { deriveAccountType, type AccountType } from "@/hooks/useAccountTypes";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";

/**
 * Canonical gate for consumer plan / STRAND+ upgrade UI.
 *
 * Upgrade CTAs, STRAND+ upsell banners and consumer paywall prompts are a
 * CONSUMER-only feature. Professional, brand and admin accounts must never see
 * them anywhere in the app (nav, profile, feature gates, empty states).
 *
 * They are also hidden from members who have nothing to upgrade FROM: a lapsed
 * membership is asked to resubscribe, not to upsell, and complimentary members
 * are never asked to pay.
 */
export function useUpgradeEligibility() {
  const { roles, loading } = useRoles();
  const { stripeActive, complimentary, isLoading: subLoading } = useConsumerSubscription();
  const accountType: AccountType = deriveAccountType(roles as string[]);
  const canUpgrade =
    !loading && !subLoading && accountType === "consumer" && stripeActive && !complimentary;
  return {
    accountType,
    loading: loading || subLoading,
    /** Render upgrade/upsell UI only when true. */
    canUpgrade,

    /** Where a non-consumer should go instead of an upgrade screen. */
    homePath:
      accountType === "admin"
        ? "/admin"
        : accountType === "professional"
          ? "/pro"
          : accountType === "brand"
            ? "/brand"
            : "/home",
  };
}
