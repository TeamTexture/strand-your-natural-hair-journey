import { useLocation } from "react-router-dom";

export type OwnerMode = "brand" | "pro";

/** Derive campaign owner from the current route. `/pro/campaigns*` = pro campaign
 *  path (uses pro subscription + inserts owner_type='pro'); everything else
 *  under /brand* = brand offer path. Both share the same underlying tables and
 *  booking calendar — this is only about UI/eligibility framing. */
export function useOwnerMode(): OwnerMode {
  const { pathname } = useLocation();
  return pathname.startsWith("/pro/campaigns") ? "pro" : "brand";
}

export function ownerHomeRoute(mode: OwnerMode) {
  return mode === "pro" ? "/pro/campaigns" : "/brand";
}

export function ownerNewRoute(mode: OwnerMode) {
  return mode === "pro" ? "/pro/campaigns/new" : "/brand/offers/new";
}

export function ownerOfferRoute(mode: OwnerMode, id: string) {
  return mode === "pro" ? `/pro/campaigns/${id}` : `/brand/offers/${id}`;
}
