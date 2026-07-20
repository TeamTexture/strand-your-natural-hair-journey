import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { HelpCircle, Heart, Droplet, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductThumb from "@/components/ProductThumb";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useHomeAlerts } from "@/hooks/useHomeAlerts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useGoals } from "@/hooks/useGoals";
import { useGoalTip } from "@/hooks/useGoalTip";
import { Ruler, Sparkles } from "lucide-react";
import {
  loadClinicalContext,
  loadClinicalContextLocal,
  invalidateClinicalContextCache,
} from "@/lib/clinicalContext";
import BrandLink from "@/components/BrandLink";
import HomeTour from "@/components/HomeTour";
import AppointmentFollowUpDialog from "@/components/AppointmentFollowUpDialog";
import { useSmartInline } from "@/lib/smartInline";


// Rich text rendering is delegated to useSmartInline() inside the component
// so product/ingredient/heat-hat links resolve against the user's shelf.


const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight" aria-label={`${n} stars`}>
    {"★".repeat(n)}
    <span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const getTimeBasedGreeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

interface ProfileStyle {
  current_hairstyle?: string;
  style_set_at?: string;
  planned_next_style?: string;
}

const Home = () => {
  const navigate = useNavigate();
  const renderRichText = useSmartInline();
  const location = useLocation();
  const { user } = useAuth();
  const greeting = getTimeBasedGreeting();
  const [firstName, setFirstName] = useState<string>("");
  const { visibleAlerts, loading: alertsLoading, dismiss, dismissAll } = useHomeAlerts();
  const { products: shelfProducts, loading: shelfLoading } = useUserProducts("shelf");
  const { last: lastWash, daysSinceLast } = useWashDays();
  const { lengthGoal } = useGoals();
  const { data: goalTip, isLoading: tipLoading } = useGoalTip(lengthGoal);
  const queryClient = useQueryClient();
  const [nextAppt, setNextAppt] = useState<{ date: string; pro: string } | null>(null);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [bloodSummary, setBloodSummary] = useState<{
    panelDate: string | null;
    label: string | null;
    total: number;
    flagged: number;
    insights: string[];
  } | null>(null);
  const [style, setStyle] = useState<ProfileStyle>(() => {
    // Hydrate instantly from the local snapshot so the Home card never
    // flashes empty on first paint.
    const local = loadClinicalContextLocal();
    return {
      current_hairstyle: local.style?.current_hairstyle ?? undefined,
      style_set_at: local.style?.style_set_at ?? undefined,
      planned_next_style: local.style?.planned_next_style ?? undefined,
    };
  });

  // Re-fetch style from DB (with localStorage fallback) whenever the user
  // lands on Home, regains focus, the tab becomes visible again, OR an
  // in-tab "strand:style-updated" event fires (dispatched by onboarding
  // Step 4 and SetCurrentStyle the moment they save). The custom event
  // matters because the native `storage` event only fires in OTHER tabs.
  useEffect(() => {
    let cancelled = false;
    const refresh = async (forceFresh: boolean) => {
      if (forceFresh) invalidateClinicalContextCache();
      const ctx = await loadClinicalContext();
      if (cancelled) return;
      setStyle({
        current_hairstyle: ctx.style?.current_hairstyle ?? undefined,
        style_set_at: ctx.style?.style_set_at ?? undefined,
        planned_next_style: ctx.style?.planned_next_style ?? undefined,
      });
    };
    // Initial mount: use the (possibly cached) edge-function result so
    // navigations back to Home don't pay a full decrypt round-trip.
    void refresh(false);
    const onEvt = () => void refresh(true);

    window.addEventListener("focus", onEvt);
    window.addEventListener("storage", onEvt);
    window.addEventListener("strand:style-updated", onEvt);
    document.addEventListener("visibilitychange", onEvt);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onEvt);
      window.removeEventListener("storage", onEvt);
      window.removeEventListener("strand:style-updated", onEvt);
      document.removeEventListener("visibilitychange", onEvt);
    };
  }, [location.key]);


  // Resolve the display name from the profiles table first
  useEffect(() => {
    if (!user) { setFirstName(""); return; }
    let cancelled = false;
    const fallback =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "";
    setFirstName(fallback.split(" ")[0]);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data?.display_name) {
        setFirstName(data.display_name.split(" ")[0]);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Next appointment
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("appointments")
        .select("appointment_date, professional_name")
        .eq("user_id", user.id)
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true })
        .limit(1);
      if (!cancelled && data && data[0]) {
        setNextAppt({ date: data[0].appointment_date, pro: data[0].professional_name });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // First "before" photo for the current style card thumbnail.
  useEffect(() => {
    if (!user) { setBeforePhotoUrl(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_before_photos")
        .select("storage_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      const path = (data?.[0] as { storage_path?: string } | undefined)?.storage_path;
      if (!path) return;
      const { data: signed } = await supabase.storage
        .from("before-photos")
        .createSignedUrl(path, 3600);
      if (!cancelled && signed?.signedUrl) setBeforePhotoUrl(signed.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Latest blood panel summary for the "My Blood Work" home section.
  useEffect(() => {
    if (!user) { setBloodSummary(null); return; }
    let cancelled = false;
    (async () => {
      const { data: panels } = await supabase
        .from("blood_panels")
        .select("id, panel_date, label")
        .eq("user_id", user.id)
        .eq("status", "logged")
        .order("panel_date", { ascending: false })
        .limit(2);
      const panelRows = (panels ?? []) as Array<{ id: string; panel_date: string | null; label: string | null }>;
      const panel = panelRows[0];
      const prevPanel = panelRows[1];
      if (!panel?.id) {
        if (!cancelled) setBloodSummary(null);
        return;
      }
      const panelIds = panelRows.map((p) => p.id);
      const { data: results } = await supabase
        .from("blood_results")
        .select("marker, value, status, panel_id")
        .eq("user_id", user.id)
        .in("panel_id", panelIds);
      const rows = (results ?? []) as Array<{ marker: string; value: number | null; status: string | null; panel_id: string }>;
      const current = rows.filter((r) => r.panel_id === panel.id);
      const previous = prevPanel ? rows.filter((r) => r.panel_id === prevPanel.id) : [];
      const prevByMarker = new Map(previous.map((r) => [r.marker, r]));

      const prettyMarker = (m: string) => m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const insights: string[] = [];

      // 1) Positive: markers that moved from flagged → normal since last test
      for (const r of current) {
        const p = prevByMarker.get(r.marker);
        if (!p) continue;
        const wasFlagged = p.status === "low" || p.status === "high";
        const nowNormal = r.status === "normal" || r.status === "ok" || r.status === null;
        if (wasFlagged && nowNormal) {
          insights.push(`${prettyMarker(r.marker)} back in range vs last test`);
        }
      }

      // 2) Negative: currently flagged markers (prioritise ones that worsened)
      const flaggedRows = current.filter((r) => r.status === "low" || r.status === "high");
      const worsened = flaggedRows.filter((r) => {
        const p = prevByMarker.get(r.marker);
        return !p || p.status === "normal" || p.status === "ok" || p.status == null;
      });
      const orderedFlagged = [...worsened, ...flaggedRows.filter((r) => !worsened.includes(r))];
      for (const r of orderedFlagged) {
        const dir = r.status === "low" ? "Low" : "High";
        insights.push(`${dir} ${prettyMarker(r.marker)}`);
      }

      // 3) Fallback: notable movement in a normal marker
      if (insights.length === 0 && previous.length > 0) {
        for (const r of current) {
          const p = prevByMarker.get(r.marker);
          if (!p || r.value == null || p.value == null || p.value === 0) continue;
          const pct = ((Number(r.value) - Number(p.value)) / Number(p.value)) * 100;
          if (Math.abs(pct) >= 15) {
            insights.push(`${prettyMarker(r.marker)} ${pct > 0 ? "up" : "down"} ${Math.round(Math.abs(pct))}% vs last test`);
            if (insights.length >= 3) break;
          }
        }
      }

      if (insights.length === 0) {
        insights.push("All results within normal range");
      }

      if (!cancelled) {
        setBloodSummary({
          panelDate: panel.panel_date ?? null,
          label: panel.label ?? null,
          total: current.length,
          flagged: flaggedRows.length,
          insights: insights.slice(0, 3),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Days in style
  const daysInStyle = style.style_set_at
    ? Math.max(0, Math.floor((Date.now() - new Date(style.style_set_at).getTime()) / 86_400_000))
    : null;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const lastWashSub = lastWash
    ? `Last: ${daysSinceLast === 0 ? "today" : `${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago`}`
    : "Tap to log your first wash day";

  const apptSub = nextAppt ? `Next: ${fmtDate(nextAppt.date)}` : "No upcoming appointments";

  return (
    <ScreenLayout bottomNav>
      {/* greeting */}
      <header className="px-5 pt-3 pb-2 flex items-start justify-between">
        <div>
          <p className="font-body text-sm text-muted-foreground">{greeting},</p>
          <h1 className="font-display text-[24px] font-bold leading-tight">
            {firstName || "there"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/help")}
            aria-label="Help & Support"
            className="size-11 rounded-full bg-card border border-border text-foreground/80 hover:text-primary hover:border-primary/50 flex items-center justify-center transition-colors"
          >
            <HelpCircle className="size-5" />
          </button>
          <button
            onClick={() => navigate("/profile")}
            aria-label="Profile"
            className="size-11 rounded-full overflow-hidden shadow-sm"
          >
            <UserAvatar name={firstName || "there"} size="size-11" editable={false} />
          </button>
        </div>
      </header>


      <div className="px-5 space-y-4 pb-6">
        {/* current style — editorial terra card */}
        {style.current_hairstyle ? (
          <div data-tour="current-style" className="relative overflow-hidden rounded-[28px] border border-white/5 shadow-xl bg-[#4A3728]">
            {/* Decorative glows / rings */}
            <div className="pointer-events-none absolute top-0 right-0 w-48 h-48 bg-[#C5A059]/10 rounded-full -mr-20 -mt-20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-24 left-0 w-32 h-32 border border-[#C5A059]/10 rounded-full -ml-16" />
            <div className="pointer-events-none absolute -bottom-6 -right-6 opacity-5">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="0.5">
                <path d="M12 2C12 2 12 10 4 12C12 14 12 22 12 22C12 22 12 14 20 12C12 10 12 2 12 2Z" />
              </svg>
            </div>

            <div className="relative z-10 p-6">
              {/* Header row */}
              <div className="flex justify-between items-start mb-6">
                <div className="min-w-0 pr-3">
                  <p className="text-[#C5A059] uppercase tracking-[0.25em] text-[10px] font-semibold font-body">
                    Current style
                  </p>
                  <h2 className="font-display text-white text-[26px] leading-tight mt-1 break-words">
                    {style.current_hairstyle}
                  </h2>
                  <p className="text-[#E0D7CC]/80 text-xs font-body mt-1">
                    {daysInStyle != null ? `Day ${daysInStyle} in rotation` : "Just set"}
                  </p>
                </div>
                <button
                  onClick={() => navigate("/home/style")}
                  className="shrink-0 text-[#C5A059] text-[10px] font-bold tracking-[0.2em] uppercase border border-[#C5A059]/30 px-3 py-1 rounded-full hover:bg-white/5 transition-colors font-body"
                >
                  Edit
                </button>
              </div>

              {/* Hero photo */}
              <button
                onClick={() => navigate("/onboarding/strand-summary")}
                aria-label="See My Strand Summary"
                className="relative block w-full mb-5"
              >
                <div className="absolute -inset-1.5 border border-[#C5A059]/40 rounded-[26px] rotate-1" />
                <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-[#3A2B1F] flex items-center justify-center text-[#C5A059]/40 border border-white/5 shadow-2xl">
                  {beforePhotoUrl ? (
                    <img
                      src={beforePhotoUrl}
                      alt="Your hair"
                      loading="eager"
                      decoding="async"
                      className="w-full h-full object-cover"
                      style={{ imageRendering: "auto" }}
                    />
                  ) : (
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Next planned */}
              <button
                onClick={() => navigate("/home/style")}
                className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md hover:bg-white/10 transition-colors mb-6"
              >
                <p className="text-[#C5A059] text-[9px] uppercase tracking-[0.2em] mb-1 font-bold font-body">
                  Next planned
                </p>
                <p className="font-display text-white text-base leading-snug italic break-words">
                  {style.planned_next_style || "Tap to plan"}
                </p>
              </button>

              {/* Divider */}
              <div className="relative flex items-center mb-4">
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="mx-3 w-1 h-1 bg-[#C5A059] rounded-full shadow-[0_0_8px_#C5A059]" />
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>

              {/* Action link */}
              <button
                onClick={() => navigate("/onboarding/strand-summary")}
                className="group w-full flex items-center justify-between py-1"
              >
                <span className="text-[#C5A059] text-[11px] font-semibold uppercase tracking-[0.2em] group-hover:text-white transition-colors font-body">
                  See my strand summary
                </span>
                <svg className="w-5 h-5 text-[#C5A059] group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <SurfaceCard data-tour="current-style">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Current style</p>
            <button onClick={() => navigate("/home/style")} className="text-left w-full">
              <p className="text-sm text-muted-foreground">
                No style logged yet. Tap to add your current style.
              </p>
            </button>
          </SurfaceCard>
        )}


        {/* primary goal — the label adapts to whatever the user actually
            committed to (length retention, moisture, scalp health, a custom
            challenge, etc.) so the home screen never mislabels their goal. */}
        <SurfaceCard data-tour="length-goal">

          {(() => {
            const goalLabel = (() => {
              if (!lengthGoal) return "Your goal";
              const kindMap: Record<string, string> = {
                length_retention: "Length goal",
                moisture: "Moisture goal",
                scalp_health: "Scalp goal",
                breakage: "Breakage goal",
                definition: "Definition goal",
                protective_styling: "Protective styling goal",
                growth: "Growth goal",
                thickness: "Thickness goal",
                challenge: "Your goal",
              };
              if (lengthGoal.kind && kindMap[lengthGoal.kind]) return kindMap[lengthGoal.kind];
              const title = lengthGoal.title?.trim();
              if (title && title.toLowerCase() !== "hair goal") {
                const words = title.split(/\s+/).slice(0, 4).join(" ");
                return words.length > 32 ? words.slice(0, 32) + "…" : words;
              }
              return "Your goal";
            })();
            return (
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
                  {goalLabel}
                </p>
                <button
                  onClick={() => navigate("/journal")}
                  className="text-xs uppercase tracking-[0.15em] text-primary font-medium shrink-0 ml-2"
                >
                  {lengthGoal ? "Edit" : "Set"}
                </button>
              </div>
            );
          })()}
          {lengthGoal ? (
            (() => {
              const unit = lengthGoal.unit || "inches";
              const current = lengthGoal.current_value ?? 0;
              const target = lengthGoal.target_value;
              const start = lengthGoal.start_value ?? 0;
              const pct = target && target > start
                ? Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100))
                : null;
              const targetDate = lengthGoal.target_date
                ? new Date(lengthGoal.target_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                : null;
              // The user's own words come first — challenge is the free-text
              // they wrote in the editor, target_text is what success looks
              // like to them. Fall back to a numeric summary only if neither
              // exists.
              const userText =
                lengthGoal.challenge?.trim() ||
                lengthGoal.target_text?.trim() ||
                lengthGoal.title?.trim() ||
                null;
              return (
                <div className="w-full">
                  <button
                    onClick={() => navigate("/journal")}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                        <Ruler className="size-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-base font-semibold leading-snug">
                          {userText ?? `${current} ${unit}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {target != null
                            ? `${current} / ${target} ${unit}${targetDate ? ` · by ${targetDate}` : ""}`
                            : targetDate
                              ? `Target: ${targetDate}`
                              : "Tap to update progress"}
                        </p>
                      </div>
                    </div>
                    {pct != null && (
                      <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </button>

                  {/* AI tip — pulled from the goal-tip edge function using
                      the user's full profile. Cached per goal id+updated_at
                      so it loads instantly after the first generation. */}
                  <div className="mt-3 rounded-[12px] bg-primary/10 border border-primary/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="size-3.5 text-primary" />
                      <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">
                        Strand tip of the day
                      </p>
                    </div>
                    {goalTip ? (
                      <>
                        <p className="text-sm font-medium leading-snug">
                          {renderRichText(goalTip.headline)}
                        </p>
                        <p className="text-xs text-foreground/80 leading-relaxed mt-1">
                          {renderRichText(goalTip.body)}
                        </p>
                        {goalTip.actions?.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {goalTip.actions.slice(0, 3).map((a, i) => {
                              const actionText = typeof a === "string" ? a : a.action;
                              const why = typeof a === "string" ? "" : a.why;
                              return (
                                <li
                                  key={i}
                                  className="text-xs text-foreground/80 leading-snug flex gap-1.5"
                                >
                                  <span className="text-primary mt-0.5">•</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground">
                                      {renderRichText(actionText)}
                                    </p>
                                    {why && (
                                      <p className="text-[11px] text-muted-foreground/90 leading-snug mt-0.5">
                                        <span className="uppercase tracking-wider text-primary/70 text-[9px] font-semibold mr-1">Why</span>
                                        {renderRichText(why)}
                                      </p>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="block size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                        <p className="text-xs text-muted-foreground italic">
                          Loading your Strand tip…
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <button
              onClick={() => navigate("/journal")}
              className="text-left w-full"
            >
              <p className="text-sm text-muted-foreground">
                No length goal set. Tap to add your starting length and target.
              </p>
            </button>
          )}
        </SurfaceCard>

        {/* My Blood Work */}
        <SurfaceCard data-tour="blood-work">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              My Blood Work
            </p>
            <button
              onClick={() => navigate("/blood-history")}
              className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
            >
              Review
            </button>
          </div>
          {bloodSummary ? (
            <button
              onClick={() => navigate("/blood-history")}
              className="w-full text-left"
            >
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                  <Droplet className="size-5 text-primary fill-primary/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold leading-snug">
                    {bloodSummary.label ?? "Blood test"}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
                    {bloodSummary.panelDate
                      ? new Date(bloodSummary.panelDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : ""}
                    {` · ${bloodSummary.total} marker${bloodSummary.total === 1 ? "" : "s"}`}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {bloodSummary.insights.map((line, i) => {
                      const isNegative = /^(low|high)\b/i.test(line);
                      const isPositive = /back in range|within normal/i.test(line);
                      const dotClass = isNegative
                        ? "bg-destructive"
                        : isPositive
                          ? "bg-good"
                          : "bg-primary";
                      return (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground/85 leading-snug">
                          <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${dotClass}`} />
                          <span className="min-w-0">{line}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={() => navigate("/blood-history")}
              className="text-left w-full"
            >
              <p className="text-sm text-muted-foreground">
                No blood work logged yet. Tap to add your first panel.
              </p>
            </button>
          )}
        </SurfaceCard>

        <SurfaceCard data-tour="alerts" tone="dark" padded={false}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-alert-dark-foreground font-medium">
              🔔 Alerts {visibleAlerts.length > 0 && `(${visibleAlerts.length})`}
            </span>
            {visibleAlerts.length > 0 && (
              <button
                onClick={() => {
                  dismissAll();
                  toast("All alerts cleared");
                }}
                className="text-[11px] uppercase tracking-[0.15em] text-primary"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="px-3 pb-3 space-y-2">
            {alertsLoading ? (
              <p className="px-2 py-3 text-[11px] text-alert-dark-foreground/60">
                Checking your data…
              </p>
            ) : visibleAlerts.length === 0 ? (
              <div className="mx-1 my-1 p-3 rounded-[10px] border border-good/40 bg-good/10">
                <p className="text-xs text-good font-medium">
                  No alerts right now. Your hair is on track ✓
                </p>
              </div>
            ) : (
              visibleAlerts.map((a) => {
                const isDanger = a.tone === "danger";
                return (
                <div
                  key={a.id}
                  className={
                    isDanger
                      ? "relative w-full p-3 pr-9 rounded-[10px] border-2 border-red-600/70 bg-red-600/20 hover:border-red-600 transition-colors"
                      : "relative w-full p-3 pr-9 rounded-[10px] border border-primary/30 bg-alert-dark/40 hover:border-primary/60 transition-colors"
                  }
                >
                  <button
                    onClick={() => navigate(a.to)}
                    className="w-full text-left"
                  >
                    <p className={`text-xs font-medium leading-tight ${isDanger ? "text-red-100" : "text-alert-dark-foreground"}`}>
                      {a.emoji} {a.title}
                    </p>
                    <p className={`text-[11px] mt-1 ${isDanger ? "text-red-100/85" : "text-alert-dark-foreground/70"}`}>{a.body}</p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(a.id);
                      toast("Alert cleared");
                    }}
                    aria-label="Dismiss alert"
                    className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center transition-colors ${isDanger ? "text-red-100/60 hover:text-red-100" : "text-alert-dark-foreground/50 hover:text-alert-dark-foreground"}`}
                  >
                    ✕
                  </button>
                </div>
                );
              })
            )}
          </div>
        </SurfaceCard>
      </div>

      <SectionLabel>Quick actions</SectionLabel>
      <div data-tour="quick-actions" className="px-5 grid grid-cols-2 gap-3">

        <button
          data-tour="qa-wash"
          onClick={() => navigate("/wash-day")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">💧</div>
          <p className="text-sm font-medium font-body leading-tight">Log Wash Day</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{lastWashSub}</p>
        </button>
        <button
          data-tour="qa-product"
          onClick={() => navigate("/products")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">📸</div>
          <p className="text-sm font-medium font-body leading-tight">Add Product</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Scan or screenshot</p>
        </button>
        <button
          data-tour="qa-journal"
          onClick={() => navigate("/journal")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">📖</div>
          <p className="text-sm font-medium font-body leading-tight">Style Journal</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Document your favourite styles</p>
        </button>
        <button
          data-tour="qa-appt"
          onClick={() => navigate("/appointments")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">📅</div>
          <p className="text-sm font-medium font-body leading-tight">Appointments</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{apptSub}</p>
        </button>
      </div>

      <SectionLabel>My shelf</SectionLabel>
      <div data-tour="my-shelf" className="px-5 pb-6">

        <SurfaceCard padded={false} className="divide-y divide-border/60">
          {shelfLoading ? (
            <div className="p-4 text-[11px] text-muted-foreground">Loading…</div>
          ) : shelfProducts.length === 0 ? (
            <button
              onClick={() => navigate("/products")}
              className="w-full p-4 text-left text-xs text-muted-foreground hover:bg-primary/5 transition-colors rounded-[14px]"
            >
              Your shelf is empty. Tap + to add your first product.
            </button>
          ) : (
            <>
              {shelfProducts.slice(0, 4).map((s) => {
                const aiStars = typeof s.match_score === "number"
                  ? Math.max(1, Math.min(5, Math.round(s.match_score / 20)))
                  : (s.rating ?? 0);
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/products/profile/${s.id}`)}
                    className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-primary/5 transition-colors first:rounded-t-[14px]"
                  >
                    <ProductThumb
                      imageUrl={s.image_url}
                      storagePath={s.storage_path}
                      alt={s.name}
                      cover
                      wrapperClassName="size-11 rounded-[10px] overflow-hidden bg-primary/15 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium font-body leading-snug break-words">{s.name}</p>
                        {s.on_favourite && (
                          <Heart className="size-3 shrink-0 fill-current text-destructive" aria-label="Favourite" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground"><BrandLink brand={s.brand} /></p>
                      <Stars n={aiStars} />
                    </div>
                  </button>
                );
              })}
              {shelfProducts.length > 4 && (
                <button
                  onClick={() => navigate("/products")}
                  className="w-full p-3.5 flex items-center justify-center gap-2 text-left text-xs uppercase tracking-[0.15em] text-primary font-medium hover:bg-primary/5 transition-colors rounded-b-[14px]"
                >
                  <span>See Full Shelf</span>
                  <span aria-hidden>→</span>
                </button>
              )}
            </>
          )}
        </SurfaceCard>
      </div>

      <HomeTour />
      <AppointmentFollowUpDialog />
    </ScreenLayout>

  );
};

export default Home;
