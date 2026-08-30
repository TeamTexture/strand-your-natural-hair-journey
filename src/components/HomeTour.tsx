import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Sparkles, Minus, Check } from "lucide-react";
import { useStyleCardPhoto } from "@/hooks/useStyleCardPhoto";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";

import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures } from "@/lib/viewFeatures";
import {
  consumeTourAutostart,
  markTourFinished,
  markTourStarted,
  setTourActive,
  TOUR_START_EVENT,
  OPEN_MAIN_PHOTO_EVENT,
  MAIN_PHOTO_CLOSED_EVENT,
  setGuidanceSheetOpen,
} from "@/lib/firstRunTour";

// Bumped key — tour is refreshed once for every user when new steps are added.
const TOUR_KEY = "strand_home_tour_seen_v4";
const PENDING_KEY = "strand_home_tour_pending";

type Step = {
  target: string | null; // data-tour attribute; null centres the card
  eyebrow: string;
  title: string;
  body: string;
  /** Route this step is explained on. Defaults to Home. */
  route?: string;
  /** Optional in-step action, e.g. opening the photo picker. */
  action?: "add-photo";
  actionLabel?: string;
  /** Panel this step opens while it is on screen, and closes when it leaves. */
  openPanel?: "guidance";

};

const STEPS: Step[] = [
  {
    target: null,
    eyebrow: "Welcome",
    title: "This is your home for hair",
    body: "STRAND has read your profile, your bloods and your goal. A short walk through the parts you'll use most — under a minute, and you can skip anytime.",
  },
  {
    target: "current-style",
    eyebrow: "Home",
    title: "Your current style",
    body: "The style you're wearing now, plus what's planned next. Tap it to open your full Strand summary — the picture every recommendation is built from.",
  },
  {
    target: "style-photo",
    eyebrow: "Home",
    title: "Add a photo of your hair",
    body: "Add a picture of your hair as it looks today — it's how you'll see your progress month to month. Tap ‘Add a photo now’ and the picker opens; the tour waits and picks up right here.",
    action: "add-photo",
    actionLabel: "Add a photo now",
  },

  {
    target: "goals",
    eyebrow: "Home",
    title: "Your goal & challenges",
    body: "What you're working towards, and what's getting in the way right now. STRAND reads both on every screen, so tips, wash advice and nutrition all pull toward it.",
  },
  {
    target: "blood-work",
    eyebrow: "Home",
    title: "Your blood work",
    body: "Your markers sit here, each compared to the healthy range. Flagged results are what shape your nutrition plan and your alerts.",
  },
  {
    target: "alerts",
    eyebrow: "Home",
    title: "Alerts",
    body: "STRAND only nudges when something matters — a wash overdue, a style worn a long time, a marker moving. Tap an alert to act on it.",
  },
  {
    target: "quick-actions",
    eyebrow: "Home",
    title: "Quick actions",
    body: "One-tap shortcuts to log a wash, add a product, open your style journal, book an appointment, browse brands and pros, or view your member discounts.",
  },
  {
    target: "global-menu",
    eyebrow: "Anywhere",
    title: "The full menu",
    body: "Tap the menu icon top-right on any screen for blood work, nutrition, the directory, your style journal, help and sign out.",
  },
  {
    target: "nav-products",
    route: "/products",
    eyebrow: "Products tab",
    title: "Your product shelf",
    body: "Scan a bottle or paste a link and STRAND reads the ingredients, then scores the product against your hair, your goal and your sensitivities.",
  },
  {
    target: "nav-wash-day",
    route: "/wash-day",
    eyebrow: "Wash Day tab",
    title: "Log a wash as you go",
    body: "A few short steps: cleanse, condition, style, how your scalp felt. This is the richest signal your guidance is built from.",
  },
  {
    target: "nav-diet",
    route: "/nutrition-plan",
    eyebrow: "Diet tab",
    title: "Your nutrition plan",
    body: "Foods to prioritise, supplements to consider and what to keep apart from what — built from your markers and your diet pattern. This side of STRAND opens once you add blood results.",
  },
  {
    target: "bottom-nav-profile",
    route: "/profile",
    eyebrow: "Profile tab",
    title: "Keep your details current",
    body: "Hair type, health, medications, current style, photos and how much guidance you want. Update anything that changes and STRAND updates with you.",
  },
  {
    target: "manage-subscription",
    route: "/profile",
    eyebrow: "Profile tab",
    title: "Manage your membership here",
    body: "Scroll down your Profile tab to ‘Manage subscription’. This is where you switch plan, pause your membership, update your card or cancel — all in one place, whenever you need it.",
  },

  {
    target: "guidance-level",
    route: "/home",
    eyebrow: "Anywhere",
    title: "How much guidance you want",
    body: "Drag this to change how much STRAND explains. Turn it up for step-by-step detail on every screen, or down to just the one thing that matters most. Change it any time — it applies everywhere.",
    openPanel: "guidance",
  },

  {
    target: "take-tour",
    route: "/home",
    eyebrow: "You're set",
    title: "That's everything",
    body: "Replay this tour any time from ‘Take the tour’ on your home screen. Your goal and your challenge are already saved from setup — STRAND builds every tip around them.",
  },
];


/* ------------------------------------------------------------------ *
 * Anchoring helpers
 * ------------------------------------------------------------------ */

const findTarget = (target: string | null | undefined) =>
  target
    ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
    : null;

/** The nearest ancestor that actually scrolls — every screen scrolls its own
 *  <main> inside the phone frame, not the window. */
const scrollParentOf = (el: HTMLElement): HTMLElement | null => {
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (/(auto|scroll|overlay)/.test(oy) && p.scrollHeight > p.clientHeight + 4) return p;
    p = p.parentElement;
  }
  return null;
};

const cssPx = (name: string) => {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

/** The visible bounds the tooltip must stay inside (the phone frame),
 *  intersected with the real viewport and inset by the safe areas. */
const frameBox = () => {
  const vh =
    typeof window !== "undefined"
      ? window.visualViewport?.height ?? window.innerHeight
      : 812;
  const safeTop = cssPx("--strand-safe-top");
  const safeBottom = cssPx("--strand-safe-bottom");
  let top = 0;
  let bottom = vh;
  const frame = document.querySelector<HTMLElement>("[data-app-frame]");
  if (frame) {
    const r = frame.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top: top + safeTop, bottom: bottom - safeBottom };
};


/** Steps whose target is absent are dropped, so the counter is honest.
 *  Steps on other routes cannot be probed from Home and are always kept. */
const buildVisibleSteps = (): Step[] =>
  STEPS.filter((s) => {
    if (!s.target) return true;
    if ((s.route ?? "/home") !== "/home") return true;
    return !!findTarget(s.target);
  });

const HomeTour = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const view = useActiveRoleView();
  // Live read of "does she have a photo" — shared query key, so an upload from
  // the picker invalidates it and this step re-renders without reopening.
  const { photos: stylePhotos, refresh: refreshStylePhotos } = useStyleCardPhoto();
  // Sticky: once we have seen a photo we never render the empty state again for
  // this tour run. Guards against the query key flipping to "anon" during a
  // token refresh (which momentarily yields zero photos) and re-prompting.
  const sawStylePhotoRef = useRef(false);
  if (stylePhotos.length > 0) sawStylePhotoRef.current = true;
  const hasStylePhoto = stylePhotos.length > 0 || sawStylePhotoRef.current;

  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [settled, setSettled] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(240);

  const open = (fresh = true) => {
    if (fresh) {
      setSteps(buildVisibleSteps());
      setStep(0);
    }
    markTourStarted();
    setActive(true);
  };

  // Auto-start ONLY when onboarding just flagged the tour as pending.
  // We never auto-run for returning users on every login — they trigger it
  // manually via the pinned "Take the tour" button which dispatches an event.
  // Auto-start the first time a paid member reaches Home. Onboarding flags the
  // tour as pending, but members who paid outside that flow (or resumed on a
  // new device) must still get it — the "seen" flag is the only guard, so it
  // never replays for someone who has already been through it.
  const { eligible: tourEligible, markSeen: markTourSeen } = useFirstRunNudge("home_tour_seen_at");

  const startedRef = useRef(false);
  useEffect(() => {
    if (!tourEligible) return;
    if (startedRef.current) return;
    const requested = consumeTourAutostart();
    if (!requested && location.pathname !== "/home") return;
    const t = setTimeout(() => {
      if (location.pathname !== "/home") navigate("/home");
      startedRef.current = true;
      open(true);
      markTourSeen();
      try {
        localStorage.setItem(TOUR_KEY, "1");
      } catch {}
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourEligible, location.pathname, markTourSeen]);

  // Broadcast so other first-run prompts stand down while the tour is on screen.
  useEffect(() => {
    setTourActive(active);
    return () => setTourActive(false);
  }, [active]);

  const current = steps[step];
  const stepRoute = current?.route ?? "/home";
  useEffect(() => {
    if (!active) return;
    if (location.pathname !== stepRoute) navigate(stepRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, stepRoute]);

  // Steps that demonstrate a panel open it while they are on screen and close
  // it on advance, back, minimise or finish.
  const wantsGuidance = active && current?.openPanel === "guidance";
  useEffect(() => {
    if (!wantsGuidance) return;
    setGuidanceSheetOpen(true);
    return () => {
      setGuidanceSheetOpen(false);
    };
  }, [wantsGuidance]);



  // The photo picker sheet sits below the tour overlay, so the tour steps aside
  // while it is open and comes back on the same step once it closes.
  const pausedRef = useRef(false);
  useEffect(() => {
    const onClosed = () => {
      if (!pausedRef.current) return;
      pausedRef.current = false;
      void refreshStylePhotos();
      setActive(true);
    };
    window.addEventListener(MAIN_PHOTO_CLOSED_EVENT, onClosed as EventListener);
    return () =>
      window.removeEventListener(MAIN_PHOTO_CLOSED_EVENT, onClosed as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const openPhotoPicker = () => {
    pausedRef.current = true;
    setActive(false);
    window.dispatchEvent(new Event(OPEN_MAIN_PHOTO_EVENT));
  };

  // Allow the pinned Home button (or any caller) to replay the tour on demand.
  useEffect(() => {
    const onStart = () => open(true);
    window.addEventListener(TOUR_START_EVENT, onStart as EventListener);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- *
   * Scroll the target into view, wait for the scroll to settle, then
   * measure it. The tooltip and spotlight only appear once settled, so
   * the member never reads copy about something off-screen.
   * ---------------------------------------------------------------- */
  useLayoutEffect(() => {
    if (!active) return;
    setSettled(false);
    if (!current) return;

    if (!current.target) {
      setRect(null);
      setSettled(true);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const align = () => {
      const el = findTarget(current.target);
      if (!el) {
        // Target genuinely absent on this screen (empty state / no data yet):
        // drop the step from the run so the counter stays truthful.
        if ((current.route ?? "/home") === location.pathname) {
          setSteps((prev) => prev.filter((s) => s !== current));
          setStep((s) => Math.min(s, Math.max(0, steps.length - 2)));
          return;
        }
        setRect(null);
        setSettled(true);
        return;
      }

      const scroller = scrollParentOf(el);
      if (scroller) {
        const sBox = scroller.getBoundingClientRect();
        const eBox = el.getBoundingClientRect();
        const visibleH = sBox.height;
        const fits = eBox.height + cardH + 120 <= visibleH;
        const desiredTopInView = fits
          ? Math.max(24, (visibleH - eBox.height) / 2 - 40)
          : 76;
        const delta = eBox.top - sBox.top - desiredTopInView;
        const nextTop = Math.max(
          0,
          Math.min(scroller.scrollTop + delta, scroller.scrollHeight - visibleH),
        );
        if (Math.abs(nextTop - scroller.scrollTop) > 2) {
          scroller.scrollTo({ top: nextTop, behavior: "smooth" });
        }
      }

      // Settle: poll until the rect stops moving (or we run out of patience).
      let last = -1;
      let stable = 0;
      const started = Date.now();
      const tick = () => {
        if (cancelled) return;
        const node = findTarget(current.target);
        if (!node) {
          setSettled(true);
          return;
        }
        const box = node.getBoundingClientRect();
        if (Math.abs(box.top - last) < 0.5) stable += 1;
        else stable = 0;
        last = box.top;
        setRect(box);
        if (stable >= 3 || Date.now() - started > 900) {
          setSettled(true);
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    // Give the route/render a beat before measuring.
    timer = setTimeout(align, 60);

    const remeasure = () => {
      const el = findTarget(current.target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, current?.target, location.pathname]);

  if (!allowsMemberFeatures(view)) return null;
  if (!active || !current) return null;

  const finish = (_skipped = false) => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
      localStorage.removeItem(PENDING_KEY);
    } catch {}
    setActive(false);
    // Whether completed or skipped, the tour always hands over to the
    // mandatory goal + challenge gate (see the first-run sequence) on Home.
    if (location.pathname !== "/home") navigate("/home");
    setTimeout(() => markTourFinished(), 250);
  };

  const total = steps.length;
  // Only detectable actions count as done. add-photo is the one actionable step.
  const actionDone = current.action === "add-photo" ? hasStylePhoto : false;

  const next = () => {
    if (step >= total - 1) finish(false);
    else setStep((s) => s + 1);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  /* ---- tooltip placement: above or below the target, never over it ---- */
  const bounds = frameBox();
  const GAP = 14;
  // Hard cap so the card can never be taller than the space it has to live in.
  const viewportH =
    typeof window !== "undefined"
      ? window.visualViewport?.height ?? window.innerHeight
      : 812;
  const maxCardH = Math.max(
    200,
    Math.min(Math.round(viewportH * 0.7), bounds.bottom - bounds.top - 24),
  );

  // Small icons need more breathing room than large cards so the ring does not
  // crowd them.
  const pad = rect ? (Math.min(rect.width, rect.height) < 48 ? 12 : 8) : 8;
  const spotTop = rect ? rect.top - pad : 0;
  const spotBottom = rect ? rect.bottom + pad : 0;
  // Effective height: never reason with a height the card cannot have.
  const effH = Math.min(cardH, maxCardH);
  const placement: "below" | "above" | "float" = (() => {
    if (!rect) return "float";
    if (bounds.bottom - spotBottom - GAP >= effH + 8) return "below";
    if (spotTop - bounds.top - GAP >= effH + 8) return "above";
    // Neither side fits cleanly — take the roomier side and clamp.
    return bounds.bottom - spotBottom >= spotTop - bounds.top ? "below" : "above";
  })();

  const clamp = (v: number) =>
    Math.max(
      bounds.top + 12,
      Math.min(v, Math.max(bounds.top + 12, bounds.bottom - effH - 12)),
    );

  const tooltipTop = (() => {
    if (rect == null) return null;
    const below = clamp(spotBottom + GAP);
    const above = clamp(spotTop - GAP - effH);
    const overlaps = (top: number) => top < spotBottom && top + effH > spotTop;
    const first = placement === "below" ? below : above;
    if (!overlaps(first)) return first;
    const other = placement === "below" ? above : below;
    // Never sit over the very thing being highlighted — flip if clamping
    // would have pushed the card onto the target.
    if (!overlaps(other)) return other;
    // Both sides collide (very tall card, very tall target): stay inside the
    // frame — visibility of the card wins over clearing the target.
    return clamp(placement === "below" ? spotBottom + GAP : spotTop - GAP - effH);
  })();



  // Arrow points at the target from whichever edge faces it.
  const arrowLeft = rect
    ? Math.max(
        24,
        Math.min(
          rect.left + rect.width / 2 - (window.innerWidth / 2 - 170),
          316,
        ),
      )
    : null;




  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* Dimmed backdrop with a cutout around the spotlit element */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="strand-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && settled && (
              <rect
                x={rect.left - pad}
                y={rect.top - pad}
                width={rect.width + pad * 2}
                height={rect.height + pad * 2}
                rx={20}
                ry={20}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 12, 10, 0.78)"
          mask="url(#strand-tour-mask)"
        />
      </svg>

      {/* Small targets (header icons, tab bar icons) get a copy painted above
       *  the dimmer so they read at full brightness, not through the scrim. */}
      {rect && settled && Math.min(rect.width, rect.height) < 48 && (

        <div
          aria-hidden
          className="absolute pointer-events-none overflow-hidden rounded-[16px]"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          ref={(node) => {
            if (!node) return;
            const src = findTarget(current.target);
            if (!src) return;
            const clone = src.cloneNode(true) as HTMLElement;
            clone.style.margin = "0";
            clone.style.position = "static";
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            node.replaceChildren(clone);
          }}
        />
      )}

      {rect && settled && (
        <div
          className="absolute rounded-[24px] border-2 border-primary shadow-[0_0_0_6px_rgba(197,160,89,0.22)] pointer-events-none transition-all duration-200"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}



      <div
        ref={(node) => {
          cardRef.current = node;
          if (node) {
            const h = node.getBoundingClientRect().height;
            if (h && Math.abs(h - cardH) > 4) setCardH(h);
          }
        }}
        className="absolute left-1/2 -translate-x-1/2 w-[86%] max-w-[320px] rounded-[20px] bg-background border border-primary/30 shadow-2xl flex flex-col transition-opacity duration-150"
        style={
          tooltipTop != null
            ? { top: tooltipTop, maxHeight: maxCardH, opacity: settled ? 1 : 0 }
            : {
                top: "50%",
                transform: "translate(-50%, -50%)",
                maxHeight: maxCardH,
                opacity: settled ? 1 : 0,
              }
        }
      >
        {/* Pointer towards the highlighted element */}
        {rect && settled && arrowLeft != null && (
          <span
            aria-hidden
            className="absolute size-3 rotate-45 bg-background border-primary/30"
            style={{
              left: arrowLeft,
              ...(placement === "below"
                ? { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }
                : { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 }),
            }}
          />
        )}

        {/* Body — scrolls when the copy is longer than the space available */}
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-primary font-semibold font-body">
              <Sparkles className="size-3" />
              {current.eyebrow}
            </span>
            <span className="ml-auto text-[10px] tracking-[0.15em] text-foreground/50 font-body">
              {step + 1} / {total}
            </span>
          </div>
          <h3 className="font-display text-[18px] leading-snug">{current.title}</h3>
          <p className="text-[12.5px] text-foreground/80 font-body mt-1.5 leading-relaxed">
            {current.body}
          </p>
        </div>

        {/* Sticky action footer — never clipped, never scrolls away */}
        <div className="shrink-0 px-4 pt-2.5 pb-3.5 border-t border-primary/15 bg-background rounded-b-[20px]">
          {current.action === "add-photo" && !hasStylePhoto && (
            <Button
              variant="gold"
              size="pill"
              className="w-full mb-2"
              onClick={openPhotoPicker}
            >
              {current.actionLabel ?? "Add a photo now"}
            </Button>
          )}

          {current.action === "add-photo" && hasStylePhoto && (
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-body text-primary">
                <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary/15">
                  <Check className="size-3.5" />
                </span>
                Photo added
              </span>
              <button
                type="button"
                onClick={openPhotoPicker}
                className="ml-auto text-[10.5px] uppercase tracking-[0.18em] text-foreground/55 hover:text-foreground font-body font-medium"
              >
                Change photo
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="goldOutline" size="pill" className="flex-1" onClick={prev}>
                Back
              </Button>
            )}
            <Button
              variant={current.action && !actionDone ? "goldOutline" : "gold"}
              size="pill"
              className="flex-1"
              onClick={next}
            >
              {step === total - 1
                ? "Finish"
                : current.action && !actionDone
                  ? "Later →"
                  : "Next →"}
            </Button>
          </div>

          <div className="flex justify-center gap-1.5 mt-2.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-primary/25"
                }`}
              />
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setActive(false)}
              aria-label="Minimise tour"
              className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.22em] text-foreground/55 hover:text-foreground font-body font-medium"
            >
              Minimise
              <Minus className="size-3" />
            </button>
            <span aria-hidden className="h-3 w-px bg-foreground/20" />
            <button
              type="button"
              onClick={() => finish(true)}
              className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.22em] text-foreground/55 hover:text-foreground font-body font-medium"
            >
              Skip the tour
              <X className="size-3" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default HomeTour;

