// Records every in-app route change into session storage so smartBack knows
// where the user actually came from (and can never loop between two pages).
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { recordLocation } from "@/lib/smartBack";
import { isAllowedWhileLocked, isResumeLocked, RESUME_PATH } from "@/lib/onboardingLock";

export const useTrackInAppHistory = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const path = location.pathname + location.search;
    // Hardware / browser back while locked to the resume screen: anything
    // outside the resume screen and its three sub-flows is pushed straight
    // back to the resume screen instead of walking onboarding history.
    if (isResumeLocked() && !isAllowedWhileLocked(path)) {
      navigate(RESUME_PATH, { replace: true });
      return;
    }
    recordLocation(path);
  }, [location.pathname, location.search, navigate]);
};
