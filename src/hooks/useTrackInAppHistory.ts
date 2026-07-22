// Records every in-app route change into session storage so smartBack knows
// whether it can safely pop history or must use the fallback destination.
// Also resets the consecutive-back counter whenever the user navigates
// forward (any route change that wasn't triggered by smartBack itself).
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  isBackPopInFlight,
  markInAppHistory,
  resetBackCount,
} from "@/lib/smartBack";

export const useTrackInAppHistory = () => {
  const location = useLocation();
  useEffect(() => {
    markInAppHistory();
    if (!isBackPopInFlight()) {
      resetBackCount();
    }
  }, [location.pathname, location.search]);
};
