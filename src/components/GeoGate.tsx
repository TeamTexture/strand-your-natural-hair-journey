import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "./LoadingDot";
import CountryWaitlistSplash from "./CountryWaitlistSplash";
import { detectCountry, hasUkOverride, isUk } from "@/lib/geoGate";

/**
 * UK-only gate for FIRST ENTRY / REGISTRATION surfaces (splash + the three
 * signup screens). Deliberately NOT applied to authenticated routes: an
 * existing member travelling abroad must never be locked out of her account.
 *
 * IP geolocation is best effort — VPNs, corporate proxies and mobile carriers
 * can misreport, so the splash always offers a way through for real UK members.
 */
const GeoGate = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const [state, setState] = useState<{ checked: boolean; country: string | null; allow: boolean }>({
    checked: false,
    country: null,
    allow: false,
  });

  useEffect(() => {
    if (loading) return;
    // Already signed in — this is not a registration, never re-gate.
    if (user) {
      setState({ checked: true, country: null, allow: true });
      return;
    }
    if (hasUkOverride()) {
      setState({ checked: true, country: null, allow: true });
      return;
    }
    let live = true;
    (async () => {
      const res = await detectCountry();
      if (!live) return;
      // Fail open when our own lookup breaks; gate on non-UK or inconclusive.
      setState({
        checked: true,
        country: res.country,
        allow: res.failed === true || isUk(res.country),
      });
    })();
    return () => {
      live = false;
    };
  }, [loading, user]);

  if (loading || !state.checked) return <LoadingDot />;
  if (state.allow) return <>{children}</>;
  return (
    <CountryWaitlistSplash
      detectedCountry={state.country}
      onOverride={() => setState((s) => ({ ...s, allow: true }))}
    />
  );
};

export default GeoGate;
