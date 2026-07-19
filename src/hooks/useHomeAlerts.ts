// Generates real-time alerts for the Home screen from Supabase + localStorage.
//
// PRINCIPLE: every alert is backed by real user data. We never show "you
// haven't done X yet" placeholders — alerts only fire when the user has
// previously logged something and the system can now say something specific
// about it (overdue, encouraging, cautionary, milestone, etc.).
//
// There is *always* important data on the platform, so the rule set is wide:
//
//  Cautionary
//   - Wash overdue (7+ days since last wash) when in protective style
//   - Style worn 42+ days → time to take down
//   - Blood retest due (>85 days since latest result)
//   - Last appointment > 170 days ago → rebook
//   - Any blood marker still flagged "low" → nutrition guidance available
//   - Hard water area + no clarifying step in the last 3 wash days
//   - Avoid-list ingredient detected on a product currently on the shelf
//   - Product rated 1–2 still marked on shelf
//   - Reported breakage on the most recent wash day
//   - Planned next style date is in the past or within 3 days
//   - Goal target date passed without status complete
//   - Appointment scheduled in the next 3 days
//
//  Positive / encouraging
//   - Wash logged in the last 3 days → streak reinforcement
//   - Journal entry added in the last 3 days
//   - 3+ wash days logged in the last 30 days
//   - High-rated product (4–5) marked as a favourite
//   - Goal status complete
//
// Dismissals persist to localStorage keyed by alert id + a "signature"
// describing the underlying state. When the signature changes (e.g. new wash
// logged, new blood test) the dismissal no longer applies and the alert
// re-appears as a *new* alert. Until then it stays cleared across reloads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { loadClinicalContext } from "@/lib/clinicalContext";

export interface HomeAlert {
  id: string;
  emoji: string;
  title: string;
  body: string;
  to: string;
  /** "warning" = cautionary; "good" = positive/encouraging; "danger" = urgent (red).
   *  Used by the UI if it wants to style alerts differently. */
  tone?: "warning" | "good" | "danger";
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

const daysUntil = (iso: string | null | undefined) => {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.ceil((t - Date.now()) / DAY_MS);
};

const safeParse = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Detect whether a wash_days row included a clarifying / cleanse step. */
const washHadClarifier = (steps: unknown): boolean => {
  if (!Array.isArray(steps)) return false;
  return steps.some((s) => {
    const label =
      (typeof s === "string" ? s : (s as { name?: string; type?: string })?.name ?? (s as { type?: string })?.type ?? "") + "";
    const lc = label.toLowerCase();
    return (
      lc.includes("clarify") ||
      lc.includes("clarifier") ||
      lc.includes("chelat") ||
      lc.includes("cleanse") ||
      lc.includes("shampoo")
    );
  });
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

      // ---------------------------------------------------------------
      // Clinical context — DB first, localStorage fallback during rollout.
      // ---------------------------------------------------------------
      const clinical = await loadClinicalContext();

      const currentStyles: string[] = clinical.style?.current_hairstyle
        ? [clinical.style.current_hairstyle]
        : clinical.style?.style ?? [];
      const styleStartDate = clinical.style?.style_set_at ?? null;
      const plannedNext = clinical.style?.planned_next_style ?? null;
      const plannedChangeDate = clinical.style?.planned_change_date ?? null;
      const inTakedownStyle = currentStyles.some(isTakedownStyle);

      // (Water-hardness alert removed.)

      const lastWashIso = (() => {
        try {
          return localStorage.getItem("strand_last_wash_date");
        } catch {
          return null;
        }
      })();
      const daysSinceWashLocal = daysSince(lastWashIso);

      // ---------------------------------------------------------------
      // Backend queries — batch for speed
      // ---------------------------------------------------------------
      const [
        bloodRes,
        apptRes,
        recentWashRes,
        washCountRes,
        breakageWashRes,
        upcomingApptRes,
        shelfRes,
        ingListsRes,
        ratingsRes,
        goalsRes,
        journalRes,
        milestoneRes,
      ] = await Promise.all([
        supabase
          .from("blood_results")
          .select("marker, status, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("appointments")
          .select("appointment_date, professional_name")
          .eq("user_id", user.id)
          .lte("appointment_date", new Date().toISOString().slice(0, 10))
          .order("appointment_date", { ascending: false })
          .limit(1),
        supabase
          .from("wash_days")
          .select("wash_date, steps, breakage")
          .eq("user_id", user.id)
          .order("wash_date", { ascending: false })
          .limit(3),
        supabase
          .from("wash_days")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte(
            "wash_date",
            new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10),
          ),
        supabase
          .from("wash_days")
          .select("wash_date, breakage")
          .eq("user_id", user.id)
          .order("wash_date", { ascending: false })
          .limit(1),
        supabase
          .from("appointments")
          .select("appointment_date, professional_name")
          .eq("user_id", user.id)
          .gte("appointment_date", new Date().toISOString().slice(0, 10))
          .order("appointment_date", { ascending: true })
          .limit(1),
        supabase
          .from("user_products")
          .select("name, brand, ingredients, rating")
          .eq("user_id", user.id)
          .eq("on_shelf", true),
        supabase
          .from("ingredient_lists")
          .select("ingredient, list_kind")
          .eq("user_id", user.id),
        supabase
          .from("product_ratings")
          .select("product_name, product_brand, rating, updated_at")
          .eq("user_id", user.id)
          .gte("rating", 4)
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase
          .from("user_goals")
          .select("id, title, status, target_date, updated_at")
          .eq("user_id", user.id),
        supabase
          .from("journal_entries")
          .select("entry_date, title")
          .eq("user_id", user.id)
          .order("entry_date", { ascending: false })
          .limit(1),
        supabase
          .from("user_milestone_photos")
          .select("taken_on")
          .eq("user_id", user.id)
          .order("taken_on", { ascending: false })
          .limit(1),
      ]);

      // ---------------------------------------------------------------
      // Wash day source-of-truth: prefer the most recent backend record.
      // ---------------------------------------------------------------
      const lastWashRow = recentWashRes.data?.[0] ?? null;
      const lastWashDate = lastWashRow?.wash_date ?? lastWashIso ?? null;
      const daysSinceWash = lastWashDate
        ? daysSince(`${lastWashDate}T00:00:00`)
        : daysSinceWashLocal;
      const washCount30d = washCountRes.count ?? 0;

      // ---------------------------------------------------------------
      // CAUTIONARY ALERTS
      // ---------------------------------------------------------------

      // 1. Wash overdue — fires at 7+ days regardless of style. Message
      // escalates as the gap widens so the alert stays fresh (7-day, 14-day,
      // 21-day, 30-day thresholds all read differently).
      if (
        Number.isFinite(daysSinceWash) &&
        daysSinceWash >= 7 &&
        lastWashDate
      ) {
        const styleLabel = currentStyles[0]?.toLowerCase();
        const dayLabel = inTakedownStyle && styleLabel
          ? `Day ${daysSinceWash} in ${styleLabel}`
          : `${daysSinceWash} days since your last wash`;
        const body =
          daysSinceWash >= 30
            ? "Scalp is overdue for a full cleanse — build-up and sebum oxidation are well underway."
            : daysSinceWash >= 21
              ? "Three weeks in — product residue and sebum are compromising scalp health. Log a cleanse."
              : daysSinceWash >= 14
                ? "Two weeks since your last wash. Time to reset the scalp."
                : "Product build-up begins now. Log a cleanse.";
        next.push({
          id: "wash-overdue",
          emoji: "💧",
          title: `Wash day overdue — ${dayLabel}`,
          body,
          to: "/wash-day",
          tone: "warning",
          signature: `wash:${lastWashDate}:${Math.min(daysSinceWash, 60)}`,
        });
      }

      // 2. Style worn 42+ days
      const daysInStyle = daysSince(styleStartDate);
      if (
        Number.isFinite(daysInStyle) &&
        daysInStyle >= 42 &&
        currentStyles.length > 0
      ) {
        next.push({
          id: "takedown-due",
          emoji: "✂️",
          title: "Time to take down",
          body: `${daysInStyle} days in ${currentStyles[0].toLowerCase()} — scalp needs a reset.`,
          to: "/onboarding/profile-step-4-colour",
          tone: "warning",
          signature: `style:${styleStartDate ?? "none"}`,
        });
      }

      // 3. Planned next style date passed or imminent
      const plannedDays = daysUntil(plannedChangeDate);
      if (plannedNext && plannedChangeDate && plannedDays <= 3) {
        const when =
          plannedDays < 0
            ? `was ${Math.abs(plannedDays)} day${Math.abs(plannedDays) === 1 ? "" : "s"} ago`
            : plannedDays === 0
              ? "is today"
              : `is in ${plannedDays} day${plannedDays === 1 ? "" : "s"}`;
        next.push({
          id: "planned-style-due",
          emoji: "🗓️",
          title: `${plannedNext} change ${when}`,
          body: "Update your current style so guidance keeps matching your hair.",
          to: "/onboarding/profile-step-4-colour",
          tone: "warning",
          signature: `planned:${plannedChangeDate}`,
        });
      }

      // 4. Blood markers — most recent record per marker
      const bloodRows = (bloodRes.data ?? []) as Array<{
        marker: string;
        status: string | null;
        updated_at: string;
      }>;
      const latestByMarker = new Map<
        string,
        { status: string | null; updated_at: string }
      >();
      for (const row of bloodRows) {
        if (!latestByMarker.has(row.marker)) {
          latestByMarker.set(row.marker, {
            status: row.status,
            updated_at: row.updated_at,
          });
        }
      }
      const flaggedMarkers = Array.from(latestByMarker.entries())
        .filter(([, v]) => v.status === "low" || v.status === "high")
        .map(([m, v]) => ({ marker: m, status: v.status as "low" | "high" }));
      const lastBloodIso = bloodRows[0]?.updated_at ?? null;
      const daysSinceBlood = daysSince(lastBloodIso);

      if (flaggedMarkers.length > 0) {
        const label = (f: { marker: string; status: "low" | "high" }) =>
          `${f.status === "low" ? "Low" : "High"} ${f.marker}`;
        const sample = flaggedMarkers.slice(0, 2).map(label).join(", ");
        const more = flaggedMarkers.length > 2 ? ` +${flaggedMarkers.length - 2} more` : "";
        next.push({
          id: "blood-low-markers",
          emoji: "🩸",
          title: `${flaggedMarkers.length} flagged marker${flaggedMarkers.length === 1 ? "" : "s"} on file`,
          body: `${sample}${more} — see your nutrition plan.`,
          to: "/nutrition-plan",
          tone: "warning",
          signature: `flaggedMarkers:${flaggedMarkers.map((f) => `${f.marker}:${f.status}`).sort().join(",")}`,
        });
      }

      // 5. Blood retest due — 3 months since last test
      if (lastBloodIso && daysSinceBlood >= 90) {
        next.push({
          id: "blood-retest",
          emoji: "🧪",
          title: "Time to book a blood test",
          body: `It's been ${daysSinceBlood} days since your last blood test. Book a retest so your hair guidance stays current.`,
          to: "/blood-history",
          tone: "warning",
          signature: `blood:${lastBloodIso}`,
        });
      }

      // 6. Rebook professional
      const lastApptDate = apptRes.data?.[0]?.appointment_date ?? null;
      const lastProName = apptRes.data?.[0]?.professional_name ?? null;
      const daysSinceAppt = daysSince(lastApptDate);
      if (lastApptDate && daysSinceAppt >= 170) {
        next.push({
          id: "rebook-pro",
          emoji: "📅",
          title: "Time to rebook your professional",
          body: lastProName
            ? `${daysSinceAppt} days since you saw ${lastProName}.`
            : `${daysSinceAppt} days since your last appointment.`,
          to: "/appointments",
          tone: "warning",
          signature: `appt:${lastApptDate}`,
        });
      }

      // 7. Upcoming appointment in next 3 days
      const upcomingAppt = upcomingApptRes.data?.[0];
      if (upcomingAppt?.appointment_date) {
        const dUntil = daysUntil(`${upcomingAppt.appointment_date}T00:00:00`);
        if (dUntil >= 0 && dUntil <= 3) {
          const when =
            dUntil === 0
              ? "today"
              : dUntil === 1
                ? "tomorrow"
                : `in ${dUntil} days`;
          next.push({
            id: "appt-upcoming",
            emoji: "📍",
            title: `Appointment ${when}`,
            body: upcomingAppt.professional_name
              ? `With ${upcomingAppt.professional_name}. Tap to review.`
              : "Tap to review the details.",
            to: "/appointments",
            tone: "warning",
            signature: `apptUp:${upcomingAppt.appointment_date}`,
          });
        }
      }

      // (Hard-water clarifier alert removed.)
      const recentWashes = (recentWashRes.data ?? []) as Array<{
        wash_date: string;
        steps: unknown;
        breakage: string | null;
      }>;
      void recentWashes;
      void washHadClarifier;

      // 9. Recent breakage reported
      const lastBreakageRow = breakageWashRes.data?.[0];
      const breakageNote = (lastBreakageRow?.breakage ?? "").toString().trim();
      if (
        breakageNote &&
        breakageNote.toLowerCase() !== "none" &&
        breakageNote.toLowerCase() !== "no" &&
        lastBreakageRow?.wash_date
      ) {
        next.push({
          id: "breakage-flag",
          emoji: "⚠️",
          title: "Breakage logged on your last wash",
          body: `Review your routine and check protein / moisture balance.`,
          to: `/wash-day`,
          tone: "warning",
          signature: `breakage:${lastBreakageRow.wash_date}`,
        });
      }

      // 10. (Removed) The old "avoid-list ingredient on your shelf" alert no
      // longer applies — flagged ingredients are now neutral / educational
      // and by definition already appear in the user's products, so the
      // alert would always fire and add no signal. ingListsRes is still
      // fetched in case future alerts need it.
      void ingListsRes;
      const shelfRows = (shelfRes.data ?? []) as Array<{
        name: string;
        brand: string | null;
        ingredients: string[];
        rating: number | null;
      }>;

      // 11. Low-rated product still on shelf
      const lowRatedShelf = shelfRows.filter(
        (p) => p.rating != null && p.rating <= 2,
      );
      if (lowRatedShelf.length > 0) {
        const first = lowRatedShelf[0];
        const more =
          lowRatedShelf.length > 1 ? ` +${lowRatedShelf.length - 1} more` : "";
        next.push({
          id: "low-rated-shelf",
          emoji: "👎",
          title: "Low-rated product still on shelf",
          body: `${first.brand ? `${first.brand} ` : ""}${first.name}${more}. Move it off?`,
          to: "/products",
          tone: "warning",
          signature: `lowShelf:${lowRatedShelf
            .map((p) => `${p.brand}|${p.name}`)
            .sort()
            .join("/")}`,
        });
      }

      // 12. Goal target date passed without completion
      const goals = (goalsRes.data ?? []) as Array<{
        id: string;
        title: string;
        status: string;
        target_date: string | null;
        updated_at: string;
      }>;
      const overdueGoal = goals.find(
        (g) =>
          g.status !== "complete" &&
          g.target_date &&
          daysUntil(`${g.target_date}T00:00:00`) < 0,
      );
      if (overdueGoal?.target_date) {
        next.push({
          id: `goal-overdue-${overdueGoal.id}`,
          emoji: "🎯",
          title: "Goal target date has passed",
          body: `${overdueGoal.title} — review or extend it.`,
          to: "/journal",
          tone: "warning",
          signature: `goalOverdue:${overdueGoal.id}:${overdueGoal.target_date}`,
        });
      }

      // 13. Milestone photos — 6-week cadence reminder. Only fires once the
      // user has captured at least one photo (so we don't pester brand new
      // accounts) AND it's been 42+ days since the last one.
      const lastMilestone = (milestoneRes.data ?? [])[0] as { taken_on: string } | undefined;
      if (lastMilestone?.taken_on) {
        const dSince = daysSince(`${lastMilestone.taken_on}T00:00:00`);
        if (dSince >= 42) {
          next.push({
            id: "milestone-due",
            emoji: "📸",
            title: "Time for your 6-week progress photo",
            body: `Last milestone was ${dSince} days ago — capture the next one.`,
            to: "/profile/milestones",
            tone: "warning",
            signature: `milestone:${lastMilestone.taken_on}`,
          });
        }
      }

      // ---------------------------------------------------------------
      // POSITIVE / ENCOURAGING ALERTS
      // ---------------------------------------------------------------

      // P1. Recent wash logged (last 3 days)
      if (Number.isFinite(daysSinceWash) && daysSinceWash <= 3 && lastWashDate) {
        const when =
          daysSinceWash === 0
            ? "today"
            : daysSinceWash === 1
              ? "yesterday"
              : `${daysSinceWash} days ago`;
        next.push({
          id: "wash-recent",
          emoji: "✨",
          title: `Wash day logged ${when}`,
          body: "Consistency compounds — keep going.",
          to: "/wash-day",
          tone: "good",
          signature: `washGood:${lastWashDate}`,
        });
      }

      // P2. 3+ wash days in the last 30 days → consistency win
      if (washCount30d >= 3) {
        next.push({
          id: "wash-streak",
          emoji: "🔥",
          title: `${washCount30d} wash days in 30 days`,
          body: "Your routine is locked in.",
          to: "/wash-day",
          tone: "good",
          signature: `streak:${washCount30d}:${lastWashDate ?? "n/a"}`,
        });
      }

      // P3. Recent journal entry
      const lastJournal = journalRes.data?.[0];
      if (lastJournal?.entry_date) {
        const dJ = daysSince(`${lastJournal.entry_date}T00:00:00`);
        if (dJ <= 3) {
          next.push({
            id: "journal-recent",
            emoji: "📓",
            title: "Journal entry added",
            body: "Reflection makes patterns visible. Add another anytime.",
            to: "/journal",
            tone: "good",
            signature: `journal:${lastJournal.entry_date}`,
          });
        }
      }

      // P4. High-rated product captured
      const topRated = ratingsRes.data?.[0] as
        | {
            product_name: string | null;
            product_brand: string | null;
            rating: number;
            updated_at: string;
          }
        | undefined;
      if (topRated?.rating && topRated.rating >= 4) {
        const label = `${topRated.product_brand ? `${topRated.product_brand} ` : ""}${
          topRated.product_name ?? "a product"
        }`;
        next.push({
          id: "fav-product",
          emoji: "💛",
          title: `${topRated.rating}★ favourite saved`,
          body: `${label} is performing well — keep it close.`,
          to: "/products",
          tone: "good",
          signature: `fav:${label}:${topRated.updated_at}`,
        });
      }

      // P5. Goal completed
      const completedGoal = goals.find((g) => g.status === "complete");
      if (completedGoal) {
        next.push({
          id: `goal-complete-${completedGoal.id}`,
          emoji: "🏆",
          title: "Goal complete",
          body: `${completedGoal.title} — set the next one.`,
          to: "/journal",
          tone: "good",
          signature: `goalDone:${completedGoal.id}:${completedGoal.updated_at}`,
        });
      }

      if (!cancelled) {
        // Cap at 8 to keep the panel scannable; cautionary first, then good.
        const ordered = [...next].sort((a, b) => {
          const aw = a.tone === "warning" ? 0 : 1;
          const bw = b.tone === "warning" ? 0 : 1;
          return aw - bw;
        });
        setAlerts(ordered.slice(0, 8));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Prune dismissals whose alert no longer exists (or whose signature changed).
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
