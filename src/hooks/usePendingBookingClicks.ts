import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";


export interface PendingBookingClick {
  id: string;
  professional_id: string;
  clicked_at: string;
  discount_code_shown: string | null;
  prompted_at: string | null;
  /** Resolved display name. Falls back gracefully if the pro is gone. */
  pro_name: string;
  /** Default location format taken from the pro's profile where known. */
  pro_clinic_name: string | null;
  pro_default_format: "in_person" | "virtual" | null;
  pro_discipline: string | null;
  /** False when the professional's profile no longer exists / is not live. */
  pro_exists: boolean;
}

/**
 * Booking-link departures this member has not yet answered.
 *
 * Reads Phase 1's `pro_booking_clicks` table — no second table exists. A click
 * is "pending" when `outcome` is null, regardless of `prompted_at`: if the
 * member closed the app mid-answer we still owe them the question. `prompted_at`
 * exists so the click is only ever COUNTED once (see `markPrompted`).
 *
 * Multiple pending clicks for the SAME professional are collapsed here to the
 * most recent one, because two departures before returning is one booking
 * attempt. The older rows are resolved server-side with the same answer.
 */
export const usePendingBookingClicks = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  // The member has just come back from the professional's booking page in
  // another tab / Safari view. Re-check the instant the app is visible again so
  // the prompt appears immediately rather than after the stale window.
  useEffect(() => {
    if (!user?.id) return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      qc.invalidateQueries({ queryKey: ["pending-booking-clicks"] });
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
    };
  }, [user?.id, qc]);

  const query = useQuery({
    queryKey: ["pending-booking-clicks", user?.id],
    enabled: !!user,
    // No stale window: a pending click must surface the moment we look.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",

    queryFn: async (): Promise<PendingBookingClick[]> => {
      const { data, error } = await supabase
        .from("pro_booking_clicks")
        .select("id,professional_id,clicked_at,discount_code_shown,prompted_at")
        .is("outcome", null)
        .order("clicked_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      // Collapse per professional, keeping the most recent departure.
      const newestByPro = new Map<string, (typeof rows)[number]>();
      for (const r of rows) newestByPro.set(r.professional_id, r);
      const collapsed = Array.from(newestByPro.values()).sort((a, b) =>
        a.clicked_at.localeCompare(b.clicked_at),
      );

      // The professional may have been deactivated or deleted since the click.
      // Missing profiles are not an error — the member can still log.
      const { data: pros } = await supabase
        .from("pro_profiles")
        .select("user_id,display_name,discipline,address_line1,city")
        .in(
          "user_id",
          collapsed.map((c) => c.professional_id),
        );
      const proMap = new Map((pros ?? []).map((p) => [p.user_id, p]));

      return collapsed.map((c) => {
        const p = proMap.get(c.professional_id) as
          | {
              display_name: string | null;
              discipline: string | null;
              address_line1?: string | null;
              city?: string | null;
            }
          | undefined;
        const clinic = [p?.address_line1, p?.city].filter(Boolean).join(", ").trim();
        return {
          ...c,
          pro_name: (p?.display_name ?? "").trim() || "your professional",
          pro_clinic_name: clinic || null,
          // A pro with a physical address defaults to in person; otherwise we
          // make no assumption and let the member choose.
          pro_default_format: clinic ? ("in_person" as const) : null,
          pro_discipline: p?.discipline ?? null,
          pro_exists: !!p,
        };
      });
    },
  });

  return query;
};


/** Stamp `prompted_at` so a shown prompt is never double-counted. */
export const useMarkBookingClickPrompted = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clickId: string) => {
      const { error } = await supabase.rpc("mark_booking_click_prompted", {
        _click_id: clickId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-booking-clicks"] });
    },
  });
};

/**
 * Record the answer. Older pending clicks for the same professional inherit it
 * server-side, so the member is never re-asked about one booking attempt.
 */
export const useResolveBookingClick = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clickId: string;
      outcome: "booked" | "not_booked";
      appointmentId?: string | null;
    }) => {
      const { error } = await supabase.rpc("resolve_booking_click", {
        _click_id: input.clickId,
        _outcome: input.outcome,
        _appointment_id: input.appointmentId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-booking-clicks"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pro-appointments"] });
    },
  });
};
