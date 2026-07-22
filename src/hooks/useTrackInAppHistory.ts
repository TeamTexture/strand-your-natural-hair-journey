// Records every in-app route change into session storage so smartBack knows
// whether it can safely pop history or must use the fallback destination.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { markInAppHistory } from "@/lib/smartBack";

export const useTrackInAppHistory = () => {
  const location = useLocation();
  useEffect(() => {
    markInAppHistory();
  }, [location.pathname, location.search]);
};
