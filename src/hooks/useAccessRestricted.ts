import { useMyProfile } from "@/hooks/useMyProfile";

/**
 * Returns whether the currently signed-in user has been access-restricted by
 * an admin. When true, every route in the app is replaced with the block
 * screen (see AccessRestrictedGate). Reads the shared profile query so this
 * check costs no extra request.
 */
export function useAccessRestricted() {
  const q = useMyProfile();
  return {
    isRestricted: !!q.data?.access_restricted,
    isLoading: q.isLoading,
  };
}
