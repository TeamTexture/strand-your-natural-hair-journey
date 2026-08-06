// useResponsiveTipRefresh — drops the client-side caches for the responsive
// `ai_summaries` tip kinds when the member's situation changes in-session.
//
// The edge functions already invalidate on signature change, but React Query
// holds these queries with `staleTime: Infinity`, so without this the member
// would keep seeing the previous tip until a reload.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const RESPONSIVE_TIP_KEYS = [
  "style_tip_v1",
  "wash_day_tip_v1",
  "wash_day_steps_v1",
] as const;

export function useResponsiveTipRefresh() {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      for (const key of RESPONSIVE_TIP_KEYS) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    };
    window.addEventListener("strand:data-changed", invalidate);
    window.addEventListener("strand:style-updated", invalidate);
    return () => {
      window.removeEventListener("strand:data-changed", invalidate);
      window.removeEventListener("strand:style-updated", invalidate);
    };
  }, [qc]);
}
