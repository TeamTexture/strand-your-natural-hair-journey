// Records every in-app route change into session storage so smartBack knows
// where the user actually came from (and can never loop between two pages).
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordLocation } from "@/lib/smartBack";

export const useTrackInAppHistory = () => {
  const location = useLocation();
  useEffect(() => {
    recordLocation(location.pathname + location.search);
  }, [location.pathname, location.search]);
};
