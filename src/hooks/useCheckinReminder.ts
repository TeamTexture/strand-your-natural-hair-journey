// The one check-in she still owes, derived — never stored.
//
// State is computed from the plan's start date, her cadence and the check-in
// rows that already exist, so there is no "reminder pending" flag anywhere to
// go stale. Day one always comes first: it is asked for regardless of the
// cadence she chose, and it never expires.
//
// Two side effects, both deliberately gated:
//   • ONE in-app notification per (plan, cycle), raised through a definer RPC
//     that is idempotent, so opening the app repeatedly can never flood the
//     bell (which only shows the newest rows).
//   • Nothing at all while an admin is viewing as a member — impersonation is
//     read-only, and a member must never get a notification because someone
//     else looked at her account.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTreatmentPlans } from "@/hooks/useTreatmentPlans";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { ALERT_KEYS } from "@/lib/alertKeys";
import { isViewingAsUser } from "@/lib/displayedUser";
import { readViewPref, writeViewPref } from "@/lib/viewPrefs";
import { cycleState, planCycles, todayKey, type CheckinCycle } from "@/lib/treatmentSchedule";

export interface OpenCheckin {
  planId: string;
  planTitle: string;
  cycle: CheckinCycle;
  /** "open" or "missed" — both are still fillable, neither is a failure. */
  state: "open" | "missed";
  /** Deep link target for the banner and the notification. */
  path: string;
}

/** Signature makes a skip permanent for THAT cycle only. */
export const checkinDismissalSignature = (planId: string, week: number) => `${planId}:${week}`;

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
};

/** Every already-submitted cycle across the member's active plans. */
function useSubmittedCycles(planIds: string[]) {
  const key = planIds.slice().sort().join(",");
  const q = useQuery({
    queryKey: ["treatment-checkins-submitted", key],
    enabled: planIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("treatment_plan_checkins")
        .select("plan_id, week_number, submitted_at")
        .in("plan_id", planIds)
        .not("submitted_at", "is", null);
      const rows = (data ?? []) as { plan_id: string; week_number: number }[];
      return {
        cycles: new Set(rows.map((r) => `${r.plan_id}:${r.week_number}`)),
        // Day one is a starting snapshot, not a numbered week. If she already
        // filled in her first week ON or BEFORE the plan started, that IS her
        // starting point — asking for another one is meaningless, so week 0 or
        // week 1 both settle it.
        startingPoint: new Set(rows.filter((r) => r.week_number <= 1).map((r) => r.plan_id)),
      };
    },
  });
  return {
    submitted: q.data?.cycles ?? null,
    startingPointDone: q.data?.startingPoint ?? null,
    loaded: planIds.length === 0 || q.isSuccess,
  };
}

export function useCheckinReminder() {
  const { user } = useAuth();
  const { bundles } = useActiveTreatmentPlans();
  const { loaded: dismissalsLoaded, isDismissed, dismiss } = useAlertDismissals();
  const planIds = useMemo(() => bundles.map((b) => b.plan.id), [bundles]);
  const { submitted, startingPointDone, loaded: submittedLoaded } = useSubmittedCycles(planIds);
  const raised = useRef<Set<string>>(new Set());

  const open = useMemo<OpenCheckin | null>(() => {
    if (!dismissalsLoaded || !submittedLoaded) return null;
    const today = todayKey();
    const done = submitted ?? new Set<string>();
    for (const b of bundles) {
      const cycles = planCycles(
        b.plan.start_date,
        b.plan.duration_weeks,
        b.plan.checkin_every_weeks ?? 1,
      );
      for (const c of cycles) {
        const saved =
          done.has(`${b.plan.id}:${c.closingWeek}`) ||
          (!!c.isDayOne && !!startingPointDone?.has(b.plan.id));
        const state = cycleState(c, cycles, saved, today);
        if (state !== "open" && state !== "missed") continue;
        if (
          isDismissed(
            ALERT_KEYS.TREATMENT_CHECKIN,
            checkinDismissalSignature(b.plan.id, c.closingWeek),
          )
        )
          continue;
        return {
          planId: b.plan.id,
          planTitle: b.plan.title,
          cycle: c,
          state,
          path: `/treatment/${b.plan.id}/checkin/${c.closingWeek}`,
        };
      }
    }
    return null;
  }, [bundles, dismissalsLoaded, submittedLoaded, submitted, startingPointDone, isDismissed]);

  // Raise the in-app notification once per cycle. Never while impersonating.
  useEffect(() => {
    if (!open || !user?.id || isViewingAsUser()) return;
    const key = `${open.planId}:${open.cycle.closingWeek}`;
    if (raised.current.has(key)) return;
    raised.current.add(key);
    void (async () => {
      try {
        await db.rpc("ensure_treatment_checkin_notification", {
          _plan_id: open.planId,
          _week: open.cycle.closingWeek,
        });
      } catch {
        /* a missed reminder must never break Home */
      }
    })();

  }, [open, user?.id]);

  /** Skip = permanent for that cycle; it never resurfaces. */
  const skip = () => {
    if (!open || isViewingAsUser()) return;
    void dismiss([
      {
        key: ALERT_KEYS.TREATMENT_CHECKIN,
        signature: checkinDismissalSignature(open.planId, open.cycle.closingWeek),
      },
    ]);
  };

  /* Minimised is a display choice, so it stays in namespaced localStorage. */
  const MIN_PREF = "treatment_checkin_banner_min";
  const cycleKey = open ? `${open.planId}:${open.cycle.closingWeek}` : "";
  const [minToken, setMinToken] = useState<string | null>(() =>
    readViewPref<string | null>(user?.id, MIN_PREF, null),
  );
  const minimised = !!open && minToken === cycleKey;
  const setMinimised = (v: boolean) => {
    const next = v ? cycleKey : null;
    writeViewPref(user?.id, MIN_PREF, next);
    setMinToken(next);
  };

  return { open, skip, minimised, setMinimised };
}
