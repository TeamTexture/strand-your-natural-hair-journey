import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { measureViewport } from "@/lib/viewportZoom";

const LOCAL_KEY = "strand_device_snapshot_day";

/**
 * Records one row per signed-in member per calendar day describing what size the
 * browser is actually laying the app out at. Admin-only evidence: there is no UI
 * for it, and a failure is silent — this must never affect a member's session.
 */
export function useDeviceSnapshot() {
  const { actualUser, loading } = useAuth();
  const userId = actualUser?.id ?? null;

  useEffect(() => {
    if (loading || !userId) return;
    const today = new Date().toISOString().slice(0, 10);
    const memoKey = `${LOCAL_KEY}:${userId}`;
    try {
      if (localStorage.getItem(memoKey) === today) return;
    } catch {
      /* private mode — fall through and let the unique index dedupe */
    }
    const m = measureViewport();
    void supabase
      .from("device_snapshots")
      .insert({
        user_id: userId,
        inner_width: m.innerWidth,
        inner_height: m.innerHeight,
        screen_width: m.screenWidth,
        screen_height: m.screenHeight,
        device_pixel_ratio: m.devicePixelRatio,
        vv_scale: m.scale,
        pointer_coarse: m.pointerCoarse,
        zoomed_out: m.zoomedOut,
        user_agent: navigator.userAgent,
      })
      .then(() => {
        try {
          localStorage.setItem(memoKey, today);
        } catch {
          /* ignore */
        }
      });
  }, [userId, loading]);
}
