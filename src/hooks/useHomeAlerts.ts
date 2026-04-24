// Generates real-time alerts for the Home screen from Supabase + localStorage.
// PRINCIPLE: every alert must be backed by real user data. We do NOT show
// "you haven't done X yet" prompts — those would feel like placeholders for a
// new user. Alerts only fire when something the user previously logged is
// now stale or overdue.
//
// Rules:
// - Wash overdue (7+ days since last LOGGED wash) when current style is braids/locs
// - Style logged for 42+ days → "Time to take down"
// - Last blood test > 85 days old → "Blood retest due — STRAND20"
// - Last appointment > 170 days ago → "Time to rebook your professional"
//
// Dismissals persist to localStorage keyed by alert id + a "signature" describing
// the underlying state. When the signature changes (e.g. new wash logged, new
// blood test, new appointment), the dismissal no longer applies and the alert
// re-appears as a *new* alert. Until then it stays cleared across reloads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface HomeAlert {
  id: string;
  emoji: string;
  title: string;
  body: string;
  to: string;
  /** Stable signature representing the underlying state. If this changes, the
   *  alert is treated as new and any previous dismissal is ignored. */
  signature: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_KEY = "strand_dismissed_alerts_v1";

type DismissMap = Record<string, string>; // alertId -> signature dismissed

const readDismissals = (): DismissMap => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeDismissals = (m: DismissMap) => {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
};

const TAKEDOWN_STYLES = [
  "box braids",
  "braids",
  "faux locs",
  "locs",
  "knotless braids",
  "cornrows",
  "twists",
  "passion twists",
];

const isTakedownStyle = (s: string) => {
  const norm = s.toLowerCase();
  return TAKEDOWN_STYLES.some((k) => norm.includes(k));
};

const daysSince = (iso: string | null | undefined) => {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / DAY_MS);
};

export function useHomeAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<HomeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissals, setDismissals] = useState<DismissMap>(() => readDismissals());

  useEffect(() => {
    if (!user) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const next: HomeAlert[] = [];

      // --- Current style (localStorage, set on onboarding step 4) ---
      let currentStyles: string[] = [];
      let styleStartDate: string | null = null;
      try {
        const raw = localStorage.getItem("strand_current_style");
        if (raw) {
          const parsed = JSON.parse(raw);
          currentStyles = Array.isArray(parsed?.style) ? parsed.style : [];
          styleStartDate = typeof parsed?.styleStartDate === "string"
            ? parsed.styleStartDate
            : null;
        }
      } catch {
        /* ignore parse errors */
      }
      const inTakedownStyle = currentStyles.some(isTakedownStyle);

      // --- Last wash day (localStorage, set in WashStep4) ---
      const lastWashIso = localStorage.getItem("strand_last_wash_date");
      const daysSinceWash = daysSince(lastWashIso);

      // Rule 1: Wash overdue + protective style. Only fires if the user has
      // actually logged a wash before — otherwise it's just a placeholder.
      // Signature is the last wash date so dismissal clears once a new wash
      // is logged.
      if (inTakedownStyle && lastWashIso && daysSinceWash >= 7) {
        const dayLabel = `Day ${daysSinceWash} in ${currentStyles[0]?.toLowerCase() ?? "style"}`;
        next.push({
          id: "wash-overdue",
          emoji: "💧",
          title: `Wash day overdue — ${dayLabel}`,
          body: "Product build-up begins now. Log a cleanse.",
          to: "/wash-day",
          signature: `wash:${lastWashIso}`,
        });
      }


      // Rule 2: Style worn 42+ days → take down.
      // Signature is the style start date so a new style clears the dismissal.
      const daysInStyle = daysSince(styleStartDate);
      if (Number.isFinite(daysInStyle) && daysInStyle >= 42 && currentStyles.length > 0) {
        next.push({
          id: "takedown-due",
          emoji: "✂️",
          title: "Time to take down",
          body: `${daysInStyle} days in ${currentStyles[0].toLowerCase()} — scalp needs a reset.`,
          to: "/onboarding/profile-step-4-colour",
          signature: `style:${styleStartDate ?? "none"}`,
        });
      }

      // --- Blood results (Supabase) ---
      const { data: bloodRows } = await supabase
        .from("blood_results")
        .select("updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      const lastBloodIso = bloodRows?.[0]?.updated_at ?? null;
      const daysSinceBlood = daysSince(lastBloodIso);

      // Rule 3: Blood retest due. Only fires if the user has at least one
      // result on file and it's older than 85 days. Signature is the latest
      // blood result timestamp so a new test clears the dismissal.
      if (lastBloodIso && daysSinceBlood >= 85) {
        next.push({
          id: "blood-retest",
          emoji: "🧪",
          title: "Blood retest due — STRAND20",
          body: `Last test ${daysSinceBlood} days ago. Order your Daye kit with code STRAND20.`,
          to: "/onboarding/blood-iron-vitamins",
          signature: `blood:${lastBloodIso}`,
        });
      }


      // --- Appointments (Supabase) ---
      const { data: apptRows } = await supabase
        .from("appointments")
        .select("appointment_date, professional_name")
        .eq("user_id", user.id)
        .order("appointment_date", { ascending: false })
        .limit(1);
      const lastApptDate = apptRows?.[0]?.appointment_date ?? null;
      const lastProName = apptRows?.[0]?.professional_name ?? null;
      const daysSinceAppt = daysSince(lastApptDate);

      // Rule 4: Rebook professional. Only fires if the user has logged at
      // least one appointment and it's been > 170 days. Signature is the last
      // appointment date so logging a new one clears the dismissal.
      if (lastApptDate && daysSinceAppt >= 170) {
        next.push({
          id: "rebook-pro",
          emoji: "📅",
          title: "Time to rebook your professional",
          body: lastProName
            ? `${daysSinceAppt} days since you saw ${lastProName}.`
            : `${daysSinceAppt} days since your last appointment.`,
          to: "/appointments",
          signature: `appt:${lastApptDate}`,
        });
      }


      if (!cancelled) {
        setAlerts(next);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Prune dismissals whose alert no longer exists (or whose signature changed).
  // This keeps the storage map small and ensures stale entries don't linger.
  useEffect(() => {
    if (alerts.length === 0 && Object.keys(dismissals).length === 0) return;
    const sigById = new Map(alerts.map((a) => [a.id, a.signature]));
    let changed = false;
    const pruned: DismissMap = {};
    for (const [id, sig] of Object.entries(dismissals)) {
      const current = sigById.get(id);
      if (current && current === sig) {
        pruned[id] = sig;
      } else {
        changed = true;
      }
    }
    if (changed) {
      setDismissals(pruned);
      writeDismissals(pruned);
    }
  }, [alerts, dismissals]);

  const visibleAlerts = useMemo(
    () => alerts.filter((a) => dismissals[a.id] !== a.signature),
    [alerts, dismissals],
  );

  const dismiss = useCallback(
    (id: string) => {
      const a = alerts.find((x) => x.id === id);
      if (!a) return;
      const next = { ...dismissals, [id]: a.signature };
      setDismissals(next);
      writeDismissals(next);
    },
    [alerts, dismissals],
  );

  const dismissAll = useCallback(() => {
    const next: DismissMap = { ...dismissals };
    for (const a of alerts) next[a.id] = a.signature;
    setDismissals(next);
    writeDismissals(next);
  }, [alerts, dismissals]);

  return { alerts, visibleAlerts, loading, dismiss, dismissAll };
}
