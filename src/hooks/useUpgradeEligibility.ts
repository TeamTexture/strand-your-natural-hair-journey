import { useRoles } from "@/hooks/useRoles";
import { deriveAccountType, type AccountType } from "@/hooks/useAccountTypes";

/**
 * Canonical gate for consumer plan / STRAND+ upgrade UI.
 *
 * Upgrade CTAs, STRAND+ upsell banners and consumer paywall prompts are a
 * CONSUMER-only feature. Professional, brand and admin accounts must never see
 * them anywhere in the app (nav, profile, feature gates, empty states).
 */
export function useUpgradeEligibility() {
  const { roles, loading } = useRoles();
  const accountType: AccountType = deriveAccountType(roles as string[]);
  const canUpgrade = !loading && accountType === "consumer";
  return {
    accountType,
    loading,
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
