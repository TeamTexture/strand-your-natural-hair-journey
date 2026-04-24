// Generates real-time alerts for the Home screen from Supabase + localStorage.
// Rules:
// - Wash overdue (7+ days since last wash) when current style is braids/locs/faux locs
// - Style logged for 42+ days → "Time to take down"
// - No blood results, or last results > 85 days old → "Blood retest due — STRAND20"
// - No appointment, or last appointment > 170 days ago → "Time to rebook your professional"
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface HomeAlert {
  id: string;
  emoji: string;
  title: string;
  body: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

      // Rule 1: Wash overdue + protective style
      if (inTakedownStyle && daysSinceWash >= 7) {
        const dayLabel = Number.isFinite(daysSinceWash)
          ? `Day ${daysSinceWash} in ${currentStyles[0]?.toLowerCase() ?? "style"}`
          : `In ${currentStyles[0]?.toLowerCase() ?? "style"}`;
        next.push({
          id: "wash-overdue",
          emoji: "💧",
          title: `Wash day overdue — ${dayLabel}`,
          body: "Product build-up begins now. Log a cleanse.",
          to: "/wash-day",
        });
      }

      // Rule 2: Style worn 42+ days → take down
      const daysInStyle = daysSince(styleStartDate);
      if (Number.isFinite(daysInStyle) && daysInStyle >= 42 && currentStyles.length > 0) {
        next.push({
          id: "takedown-due",
          emoji: "✂️",
          title: "Time to take down",
          body: `${daysInStyle} days in ${currentStyles[0].toLowerCase()} — scalp needs a reset.`,
          to: "/onboarding/profile-step-4-colour",
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

      // Rule 3: No blood OR > 85 days
      if (!lastBloodIso) {
        next.push({
          id: "blood-retest",
          emoji: "🧪",
          title: "Blood retest due — STRAND20",
          body: "No results on file. Order your Daye kit with code STRAND20.",
          to: "/onboarding/blood-iron-vitamins",
        });
      } else if (daysSinceBlood >= 85) {
        next.push({
          id: "blood-retest",
          emoji: "🧪",
          title: "Blood retest due — STRAND20",
          body: `Last test ${daysSinceBlood} days ago. Order your Daye kit with code STRAND20.`,
          to: "/onboarding/blood-iron-vitamins",
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

      // Rule 4: No appointment OR > 170 days
      if (!lastApptDate) {
        next.push({
          id: "rebook-pro",
          emoji: "📅",
          title: "Time to rebook your professional",
          body: "No appointments logged. Find a trusted pro in the directory.",
          to: "/directory",
        });
      } else if (daysSinceAppt >= 170) {
        next.push({
          id: "rebook-pro",
          emoji: "📅",
          title: "Time to rebook your professional",
          body: lastProName
            ? `${daysSinceAppt} days since you saw ${lastProName}.`
            : `${daysSinceAppt} days since your last appointment.`,
          to: "/appointments",
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

  return { alerts, loading };
}
