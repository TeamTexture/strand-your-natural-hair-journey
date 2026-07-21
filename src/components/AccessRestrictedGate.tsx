import { useAuth } from "@/hooks/useAuth";
import { useAccessRestricted } from "@/hooks/useAccessRestricted";
import AccessRestricted from "@/pages/AccessRestricted";

/**
 * Top-level gate: whenever the signed-in user is access_restricted, replace
 * the entire routed tree with the block screen. No route — consumer, pro,
 * admin, subscribe or profile — can render underneath.
 */
const AccessRestrictedGate = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  const { isRestricted } = useAccessRestricted();
  if (session && isRestricted) return <AccessRestricted />;
  return <>{children}</>;
};

export default AccessRestrictedGate;
