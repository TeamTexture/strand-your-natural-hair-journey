import { SHOW_STRAND_TIP } from "@/lib/featureFlags";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { useEffect, useMemo, useState } from "react";
import PlusBadge from "@/components/PlusBadge";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronRight, Compass, Droplet, HelpCircle, Heart, ImagePlus, RefreshCw, Tag } from "lucide-react";
import { useStyleCardPhoto } from "@/hooks/useStyleCardPhoto";
import { anchorProps } from "@/lib/scrollMemory";
import MainPhotoPicker from "@/components/style/MainPhotoPicker";
import {
  OPEN_MAIN_PHOTO_EVENT,
  MAIN_PHOTO_CLOSED_EVENT,
} from "@/lib/firstRunTour";
import TodayTreatmentCard from "@/components/treatment/TodayTreatmentCard";


import ProfileReconfirmPrompt from "@/components/ProfileReconfirmPrompt";
import AcquisitionAskModal, { useAcquisitionAsk } from "@/components/onboarding/AcquisitionAskPrompt";
import PersonalisedOffersCard from "@/components/home/PersonalisedOffersCard";
import SpeakToStrandCard from "@/components/home/SpeakToStrandCard";
import WhatsAppHelpCard from "@/components/home/WhatsAppHelpCard";
import DailyHairCard from "@/components/home/DailyHairCard";
import PrimaryActions from "@/components/home/PrimaryActions";

import PendingPlanInvites from "@/components/treatment/PendingPlanInvites";

import ListRow from "@/components/nav/ListRow";
import { ICONS } from "@/lib/iconMap";
import { useQueryClient } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import ProductThumb from "@/components/ProductThumb";
import MatchStars from "@/components/MatchStars";
import SensitivityShelfAlert from "@/components/sensitivity/SensitivityShelfAlert";
import { splitByHomemade, HomemadeProductsSection } from "@/components/product/HomemadeProductsSection";

import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWarmSponsoredWashDayTip } from "@/hooks/useWarmSponsoredWashDayTip";

import { useMyProfile } from "@/hooks/useMyProfile";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";

import { useHomeAlerts } from "@/hooks/useHomeAlerts";
import { usePlusAlerts } from "@/hooks/usePlusAlerts";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useGoals } from "@/hooks/useGoals";
import { useGoalTip } from "@/hooks/useGoalTip";
import { Sparkles, Lightbulb } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import {
  loadClinicalContext,
  loadClinicalContextLocal,
  invalidateClinicalContextCache,
} from "@/lib/clinicalContext";
import BrandLink from "@/components/BrandLink";
import GoalEditorSheet from "@/components/GoalEditorSheet";
import ChallengesEditorSheet from "@/components/journal/ChallengesEditorSheet";
import FirstRunSequence from "@/components/firstrun/FirstRunSequence";
import { useChallenges } from "@/hooks/useChallenges";
import AppointmentFollowUpDialog from "@/components/AppointmentFollowUpDialog";
import HelloKleanDialog from "@/components/HelloKleanDialog";
import { consumeHelloKleanPrompt } from "@/lib/discounts";
import { lookupHardWater } from "@/lib/hardWater";
import { useSmartInline } from "@/lib/smartInline";
import BrandBanner from "@/components/BrandBanner";
import { titleCase } from "@/lib/humanise";
import { OPEN_MENU_EVENT } from "@/components/GlobalMenu";
import TipsBlock from "@/components/tips/TipsBlock";
import AiProse from "@/components/tips/AiProse";
import LevelGate from "@/components/tips/LevelGate";
import { type GuidanceTip } from "@/lib/tipsRender";
import AiProgressBar from "@/components/AiProgressBar";


// Rich text rendering is delegated to useSmartInline() inside the component
// so product/ingredient/heat-hat links resolve against the user's shelf.



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
  const acquisitionAsk = useAcquisitionAsk();
  const renderRichText = useSmartInline();
  const location = useLocation();
  const { user } = useAuth();
  // Start the sponsored wash day tip generating now, in the background, so the
  // Wash Day screen renders it from cache instead of waiting on the model.
  useWarmSponsoredWashDayTip();
  const greeting = getTimeBasedGreeting();

  const [firstName, setFirstName] = useState<string>("");
  // Home is intentionally STATIC while mounted: every data hook loads once
  // on entry, then no realtime channels, focus refetches, or interval polls
  // run until the user navigates away and returns.
  const { visibleAlerts, loading: alertsLoading, dismiss, dismissAll } = useHomeAlerts({ static: true });
  const { hasPlus } = usePlusAccess();
  const { alerts: plusAlerts, counts: plusCounts, dismiss: dismissPlus, dismissAll: dismissAllPlus } = usePlusAlerts();
  const { products: shelfProducts, loading: shelfLoading, sponsoredById: shelfSponsoredById } = useUserProducts("shelf", { static: true });
  const { last: lastWash, daysSinceLast } = useWashDays({ static: true });
  const { goal } = useGoals();
  const { challenges } = useChallenges();
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const { level: tipsLevel, showBeginnerHelp } = useTipsLevel();
  // Home shows EXACTLY ONE tip — the STRAND tip. The fuller
  // multi-tip "How you'll get there" playbook lives on the Style Journal.
  // While SHOW_STRAND_TIP is off the card isn't rendered, so we don't request a
  // tip either — the engine is untouched, it just isn't called from Home.
  const { data: goalTip, isLoading: tipLoading } = useGoalTip(
    SHOW_STRAND_TIP ? goal : null,
    { single: true },
  );
  const queryClient = useQueryClient();
  const [nextAppt, setNextAppt] = useState<{ date: string; pro: string } | null>(null);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  // Current style card image: explicitly pinned photo → newest progress photo
  // (Strand Summary or milestone gallery) → placeholder.
  const { url: styleCardUrl, refresh: refreshStyleCardPhoto } = useStyleCardPhoto();
  const heroPhotoUrl = styleCardUrl ?? beforePhotoUrl;


  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  // The guided tour prompts for a style-card photo and hands over to this sheet,
  // then waits for it to close before carrying on.
  useEffect(() => {
    const open = () => setPhotoPickerOpen(true);
    window.addEventListener(OPEN_MAIN_PHOTO_EVENT, open as EventListener);
    return () =>
      window.removeEventListener(OPEN_MAIN_PHOTO_EVENT, open as EventListener);
  }, []);

  const handlePhotoPickerOpenChange = (open: boolean) => {
    setPhotoPickerOpen(open);
    if (!open) window.dispatchEvent(new Event(MAIN_PHOTO_CLOSED_EVENT));
  };


  // First-run sequence hand-offs: the mandatory goals gate and the optional
  // photo prompt ask Home to open the relevant editor.
  useEffect(() => {
    const openGoal = () => setGoalEditorOpen(true);
    const openChallenges = () => setChallengesOpen(true);
    const openPhoto = () => setPhotoPickerOpen(true);
    window.addEventListener("strand:open-goal-editor", openGoal);
    window.addEventListener("strand:open-challenges", openChallenges);
    window.addEventListener("strand:open-main-photo", openPhoto);
    return () => {
      window.removeEventListener("strand:open-goal-editor", openGoal);
      window.removeEventListener("strand:open-challenges", openChallenges);
      window.removeEventListener("strand:open-main-photo", openPhoto);
    };
  }, []);
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


  // Resolve the display name from the shared profile query (one request for
  // the whole screen) with an auth-metadata fallback so the greeting is
  // never blank on first paint.
  const [helloKleanOpen, setHelloKleanOpen] = useState(false);
  const { data: myProfile } = useMyProfile();
  useEffect(() => {
    if (!user) { setFirstName(""); return; }
    const fallback =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "";
    setFirstName((myProfile?.display_name || fallback).split(" ")[0]);
  }, [user, myProfile?.display_name]);

  useEffect(() => {
    if (!user || !myProfile) return;
    // If a goal was just saved and the user lives in a hard-water area,
    // surface the Hello Klean member-perk popup on this Home visit.
    const pending = consumeHelloKleanPrompt(user.id);
    if (!pending) return;
    const water = lookupHardWater(myProfile.postcode ?? undefined);
    if (water && (water.hardness === "hard" || water.hardness === "very-hard")) {
      setHelloKleanOpen(true);
    }
  }, [user, myProfile]);



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

  // Fallback thumbnail (newest progress photo) plus a nudge to the unified
  // photo query whenever a photo or style change is announced in-tab.
  useEffect(() => {
    if (!user) { setBeforePhotoUrl(null); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("user_before_photos")
        .select("storage_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const path = (data?.[0] as { storage_path?: string } | undefined)?.storage_path;
      if (!path) { if (!cancelled) setBeforePhotoUrl(null); return; }
      const { data: signed } = await supabase.storage
        .from("before-photos")
        .createSignedUrl(path, 3600);
      if (!cancelled && signed?.signedUrl) setBeforePhotoUrl(signed.signedUrl);
    };
    void load();
    const onEvt = () => { void load(); void refreshStyleCardPhoto(); };
    window.addEventListener("strand:style-updated", onEvt);
    window.addEventListener("focus", onEvt);

    return () => {
      cancelled = true;
      window.removeEventListener("strand:style-updated", onEvt);
      window.removeEventListener("focus", onEvt);
    };
  }, [user, location.key]);


  // Days in style
  const daysInStyle = style.style_set_at
    ? Math.max(0, Math.floor((Date.now() - new Date(style.style_set_at).getTime()) / 86_400_000))
    : null;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  // Alerts are intentionally NOT affected by tips level — always full list.
  const displayedAlerts = visibleAlerts;

  const lastWashSub = lastWash
    ? `Last: ${daysSinceLast === 0 ? "today" : `${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago`}`
    : "Tap to log your first wash day";

  const apptSub = nextAppt ? `Next: ${fmtDate(nextAppt.date)}` : "No upcoming appointments";

  const goalName = (() => {
    if (!goal) return "No goal set yet";
    const title = goal.title?.trim();
    // Wrap the member's own words over two lines rather than clipping them.
    if (title && title.toLowerCase() !== "hair goal") return title;
    return "Your goal";
  })();
  // A long goal gets previewed in the square tile with a way to read it in full,
  // so the tile can never stretch the dashboard row.
  const goalIsLong = Boolean(goal) && goalName.length > 70;
  const showGoalInFull = () => {
    const card = document.querySelector('[data-tour="goals"]');
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    else navigate("/journal");
  };

  // Short chip for the STRAND tip — the member's OWN words, never a category.
  const goalChipLabel = (() => {
    if (!goal) return null;
    const title = goal.title?.trim();
    if (title && title.toLowerCase() !== "hair goal") {
      const words = title.split(/\s+/).slice(0, 2).join(" ");
      return words.length > 18 ? `${words.slice(0, 18)}…` : words;
    }
    return null;
  })();

  const shelfCount = shelfProducts.length;

  return (
    <ScreenLayout bottomNav>
      {/* Members who finished onboarding before the attribution step existed get
          a one-time blocking ask over Home; answering stores it for good. */}
      {acquisitionAsk.due && <AcquisitionAskModal onDone={acquisitionAsk.markAnswered} />}
      <ProfileReconfirmPrompt />

      <PersonalisedOffersCard />
      {/* greeting */}
      <header className="px-5 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm text-muted-foreground whitespace-nowrap">{greeting},</p>
          <h1 className="font-display text-[24px] font-bold leading-tight truncate">
            {firstName || "there"}
          </h1>
          {hasPlus && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 max-w-full">
              <PlusBadge size="xs" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-primary font-bold font-body whitespace-nowrap">
                STRAND+ Member
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("strand:start-tour"))}
            aria-label="Take the tour"
            data-tour="take-tour"
            className="inline-flex items-center gap-1.5 rounded-pill border border-primary/40 bg-primary/10 px-3 h-9 text-[11px] font-semibold font-body text-primary hover:bg-primary/20 transition-colors shrink-0"
          >
            <Compass className="size-3.5" />
            Tour
          </button>
          <button
            onClick={() => navigate("/help")}
            aria-label="Help & Support"
            className="size-9 rounded-full bg-card border border-border text-foreground/80 hover:text-primary hover:border-primary/50 flex items-center justify-center transition-colors shrink-0"
          >
            <HelpCircle className="size-4" />
          </button>
          <button
            onClick={() => navigate("/profile/discounts")}
            aria-label="Offers & discounts"
            className="size-9 rounded-full bg-card border border-border text-foreground/80 hover:text-primary hover:border-primary/50 flex items-center justify-center transition-colors shrink-0"
          >
            <Tag className="size-4" />
          </button>
          <button
            onClick={() => navigate("/profile")}
            aria-label="Profile"
            className="size-9 rounded-full overflow-hidden shadow-sm shrink-0"
          >
            <UserAvatar name={firstName || "there"} size="size-9" editable={false} />
          </button>
        </div>
      </header>

      {/* THE FIVE PRIMARY CARDS (beta feedback, Sep 2026) — daily touchpoint,
          wash day, product scan, diet and nutrition, professional directory.
          Everything else on Home now sits below these, under "More on your
          hair". Nothing was removed — only reordered. */}
      <DailyHairCard />
      <PrimaryActions lastWashSub={lastWashSub} />

      {/* Alerts stay high on the page — never buried under the reorder. */}
      <div className="px-5 pb-2">
        <SurfaceCard data-tour="alerts" id="section-alerts" data-scroll-section tone="dark" padded={false}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-alert-dark-foreground font-medium">
              🔔 Alerts {displayedAlerts.length > 0 && `(${displayedAlerts.length})`}
            </span>
            {displayedAlerts.length > 0 && (
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
            ) : displayedAlerts.length === 0 ? (
              <div className="mx-1 my-1 p-3 rounded-[10px] border border-good/40 bg-good/10">
                <p className="text-xs text-good font-medium">
                  No alerts right now. Your hair is on track ✓
                </p>
              </div>
            ) : (
              displayedAlerts.map((a) => {
                const isDanger = a.tone === "danger";
                return (
                <div
                  key={a.id}
                  {...anchorProps(`alert-${a.id}`)}
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


      {/* Support stays reachable, just below the five. */}
      <div className="px-5 pb-2">
        <SpeakToStrandCard />
      </div>
      <WhatsAppHelpCard />

      <div className="px-5 space-y-4 pb-6">
        <BrandBanner slot="home" />
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
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => setPhotoPickerOpen(true)}
                    aria-label="Change your main photo"
                    className="size-7 rounded-full border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059] hover:bg-white/5 transition-colors"
                  >
                    <ImagePlus className="size-3.5" />
                  </button>
                  <button
                    onClick={() => navigate("/home/style")}
                    {...anchorProps("home-style-edit")}
                    className="text-[#C5A059] text-[10px] font-bold tracking-[0.2em] uppercase border border-[#C5A059]/30 px-3 py-1 rounded-full hover:bg-white/5 transition-colors font-body"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Hero photo */}
              <div
                {...anchorProps("home-style-photo")}
                data-tour="style-photo"
                className="relative block w-full mb-5"
              >

                <div className="absolute -inset-1.5 border border-[#C5A059]/40 rounded-[26px] rotate-1" />
                <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-[#3A2B1F] flex items-center justify-center text-[#C5A059]/40 border border-white/5 shadow-2xl">
                  {heroPhotoUrl ? (
                    <img
                      src={heroPhotoUrl}

                      alt="Your hair"
                      loading="eager"
                      decoding="async"
                      className="w-full h-full object-cover"
                      style={{ imageRendering: "auto" }}
                    />
                  ) : (
                    /* Empty state — a gentle invitation, not a blank block. */
                    <button
                      type="button"
                      onClick={() => setPhotoPickerOpen(true)}
                      className="w-full h-full flex flex-col items-center justify-center gap-2.5 px-6 text-center"
                    >
                      <span className="size-11 rounded-full border border-[#C5A059]/40 flex items-center justify-center">
                        <ImagePlus className="size-5 text-[#C5A059]" />
                      </span>
                      <span className="font-display text-white/90 text-[15px] leading-snug">
                        Add a photo of this style
                      </span>
                      <span className="text-[#E0D7CC]/60 text-[11px] font-body">
                        Tap to take one or choose from your camera roll
                      </span>
                    </button>
                  )}

                </div>
              </div>

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

              {/* Action link — progress photos now live in the Style Journal */}
              <button
                onClick={() => navigate("/journal")}
                className="group w-full flex items-center justify-between py-1"
              >
                <span className="text-[#C5A059] text-[11px] font-semibold uppercase tracking-[0.2em] group-hover:text-white transition-colors font-body">
                  Open my style journal
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
        <MainPhotoPicker
          open={photoPickerOpen}
          onOpenChange={handlePhotoPickerOpenChange}
        />


        {hasPlus && (() => {
          const totalCount = plusCounts.forum + plusCounts.events + plusCounts.messages + plusCounts.library;
          const tiles: Array<{ key: string; label: string; sub: string; emoji: string; count: number; to: string }> = [
            { key: "forum", label: "Forum", sub: "Threads & replies", emoji: "💬", count: plusCounts.forum, to: "/forum" },
            { key: "events", label: "Events", sub: "See upcoming", emoji: "📅", count: plusCounts.events, to: "/plus/events" },
            { key: "library", label: "Library", sub: "New uploads", emoji: "📚", count: plusCounts.library, to: "/plus/library" },
            { key: "messages", label: "Messages", sub: "Member DMs", emoji: "✉️", count: plusCounts.messages, to: "/messages" },
          ];
          return (
            <>
            <SurfaceCard padded={false} className="border-2 border-primary/60 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent">

              <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">
                  ✦ STRAND+ Alerts{totalCount > 0 ? ` (${totalCount})` : ""}
                </span>
                {totalCount > 0 && (
                  <button
                    onClick={() => { dismissAllPlus(); toast("STRAND+ alerts cleared"); }}
                    className="text-[11px] uppercase tracking-[0.15em] text-primary"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="px-3 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  {tiles.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => navigate(t.to)}
                      className="relative rounded-[10px] border border-primary/40 bg-card/70 hover:border-primary transition-colors p-3 text-left"
                    >
                      {t.count > 0 && (
                        <span className="absolute top-1.5 right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-bold flex items-center justify-center">
                          {t.count > 99 ? "99+" : t.count}
                        </span>
                      )}
                      <p className="text-base leading-none">{t.emoji}</p>
                      <p className="text-[10.5px] mt-1.5 uppercase tracking-[0.12em] text-primary font-semibold">{t.label}</p>
                      <p className="text-[10px] mt-0.5 text-foreground/60 leading-tight">
                        {t.count > 0 ? `${t.count} new` : t.sub}
                      </p>
                    </button>
                  ))}
                </div>
                {(() => {
                  // Library uploads intentionally do NOT show as individual
                  // notification cards — only as the numeric badge on the
                  // Library tile above.
                  const visible = plusAlerts.filter((a) => a.kind !== "library");
                  if (visible.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1.5">
                      {visible.slice(0, 3).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { dismissPlus(a.id); navigate(a.to); }}
                          className="w-full text-left p-2.5 rounded-[10px] border border-primary/30 bg-card/60 hover:border-primary/60 transition-colors"
                        >
                          <p className="text-[11.5px] font-medium leading-tight text-foreground">
                            {a.kind === "thread" ? "💬" : a.kind === "event" ? "📅" : "✉️"} {a.title}
                          </p>
                          <p className="text-[10.5px] mt-0.5 text-foreground/65 line-clamp-1">{a.body}</p>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </SurfaceCard>

            {/* Treatment plans moved to the feature directory. Only genuine
                invitations still surface here — they are time-sensitive. */}
            <div className="space-y-3">
              <PendingPlanInvites />
            </div>


            </>
          );

        })()}




        {/* STRAND TIP — its own card now, exactly one tip, STATIC. It
            regenerates only when the current style, the planned next style or
            the goal changes.

            HIDDEN FOR NOW (Aug 2026): the tip engine, the goal-tip edge
            function and useGoalTip are all untouched and still working — only
            the rendering is switched off. Flip SHOW_STRAND_TIP back to true in
            src/lib/featureFlags.ts to restore it. */}
        {SHOW_STRAND_TIP && (
        <div>
          

          <GuidanceCard
            tone="gold"
            compact
            eyebrow="Strand tip"
            icon={Lightbulb}
            headerRight={
              goalChipLabel ? (
                <span className="shrink-0 inline-flex items-center rounded-pill border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold font-body text-primary">
                  {goalChipLabel}
                </span>
              ) : undefined
            }
            headline={goalTip ? renderRichText(goalTip.headline) : undefined}
          >
            {goalTip ? (
              <>
                {/* THE ACTION FLOOR — the instruction is rendered
                    distinctly from the reason, the same pattern as the
                    wash day tip card. A headline plus a reason is not a
                    tip; the action always shows. */}
                {(goalTip.action ?? "").trim() ? (
                  <div className="flex gap-2 rounded-[10px] border border-primary/20 bg-primary/[0.06] px-2.5 py-2">
                    <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <Sparkles className="size-2.5 text-primary" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[11.5px] leading-[1.55] font-body text-foreground break-words">
                        <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-primary mr-1.5">
                          Do this
                        </span>
                        {goalTip.action!.trim()}
                      </p>
                      {(goalTip.reason ?? "").trim() && (
                        <p className="text-[11px] leading-[1.55] font-body text-foreground/75 break-words">
                          <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-foreground/50 mr-1.5">
                            Why
                          </span>
                          {goalTip.reason!.trim()}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Legacy cached tips only carried prose. */
                  <AiProse text={goalTip.reason || goalTip.body} />
                )}
                {goalTip.key_fact && (
                  <KeyFactChips className="mt-2" facts={[{ label: goalTip.key_fact }]} />
                )}
              </>
            ) : tipLoading ? (

              <AiProgressBar
                compact
                /* goal-tip measured p50 3.0s / p90 3.8s (7-day ai_call_log). */
                expectedMs={5000}
                stages={[
                  "Reading your goal and challenges",
                  "Finding the strongest tip",
                  "Writing your Strand tip",
                ]}
              />

            ) : (
              <p className="text-xs text-muted-foreground italic">
                {tipsLevel === 1
                  ? "No tip yet."
                  : "Your Strand tip will appear once you've told us your goal or your current style."}
              </p>
            )}
          </GuidanceCard>
        </div>
        )}








      </div>




      {/* Everything else in STRAND lives in the feature directory — Home stays
          short on purpose. Quick actions, the shelf strip and the homemade
          strip were removed here (Sep 2026 beta feedback); nothing was
          deleted, they are all reachable from the directory. */}
      <div className="px-5 pb-8 pt-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
          className="w-full h-11 rounded-[10px] border-[0.5px] border-primary bg-transparent text-primary text-[11px] font-body font-medium uppercase tracking-[0.18em] hover:bg-primary/5 transition-colors"
        >
          Explore all features
        </button>
      </div>


      <GoalEditorSheet
        open={goalEditorOpen}
        onOpenChange={setGoalEditorOpen}
        goal={goal}
      />
      <ChallengesEditorSheet open={challengesOpen} onOpenChange={setChallengesOpen} />
      <FirstRunSequence />
      <AppointmentFollowUpDialog />
      <HelloKleanDialog open={helloKleanOpen} onOpenChange={setHelloKleanOpen} userId={user?.id} />
    </ScreenLayout>

  );
};

export default Home;
