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
    body: "Foods to prioritise, supplements to consider and what to keep apart from what — built from your markers and your diet pattern.",
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
    target: null,
    route: "/home",
    eyebrow: "You're set",
    title: "One thing to do first",
    body: "You can replay this tour anytime from the ‘Take the tour’ button on your home screen. Next: your goal and your challenge — the two answers STRAND builds every tip around.",
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

/** The visible bounds the tooltip must stay inside (the phone frame). */
const frameBox = () => {
  const frame = document.querySelector<HTMLElement>("[data-app-frame]");
  if (frame) {
    const r = frame.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  }
  return { top: 0, bottom: typeof window !== "undefined" ? window.innerHeight : 812 };
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

  // The photo picker sheet sits below the tour overlay, so the tour steps aside
  // while it is open and comes back on the same step once it closes.
  const pausedRef = useRef(false);
  useEffect(() => {
    const onClosed = () => {
      if (!pausedRef.current) return;
      pausedRef.current = false;
      setActive(true);
    };
    window.addEventListener(MAIN_PHOTO_CLOSED_EVENT, onClosed as EventListener);
    return () =>
      window.removeEventListener(MAIN_PHOTO_CLOSED_EVENT, onClosed as EventListener);
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
  const next = () => {
    if (step >= total - 1) finish(false);
    else setStep((s) => s + 1);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  /* ---- tooltip placement: above or below the target, never over it ---- */
  const bounds = frameBox();
  const GAP = 14;
  const placement: "below" | "above" | "float" = (() => {
    if (!rect) return "float";
    if (bounds.bottom - rect.bottom - GAP >= cardH + 8) return "below";
    if (rect.top - bounds.top - GAP >= cardH + 8) return "above";
    // Neither side fits cleanly — take the roomier side and clamp.
    return bounds.bottom - rect.bottom >= rect.top - bounds.top ? "below" : "above";
  })();

  const clamp = (v: number) =>
    Math.max(bounds.top + 12, Math.min(v, bounds.bottom - cardH - 12));

  const tooltipTop =
    rect == null
      ? null
      : placement === "below"
        ? clamp(rect.bottom + GAP)
        : clamp(rect.top - GAP - cardH);

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
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
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

      {rect && settled && (
        <div
          className="absolute rounded-[24px] border-2 border-primary shadow-[0_0_0_6px_rgba(197,160,89,0.22)] pointer-events-none transition-all duration-200"
          style={{
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => setActive(false)}
          aria-label="Minimise tour"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-white/85 hover:text-white bg-black/50 backdrop-blur px-3 py-2 rounded-full"
        >
          Minimise
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => finish(true)}
          aria-label="Skip tour"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-white/85 hover:text-white bg-black/50 backdrop-blur px-3 py-2 rounded-full"
        >
          Skip tour
          <X className="size-3.5" />
        </button>
      </div>

      <div
        ref={(node) => {
          cardRef.current = node;
          if (node) {
            const h = node.getBoundingClientRect().height;
            if (h && Math.abs(h - cardH) > 4) setCardH(h);
          }
        }}
        className="absolute left-1/2 -translate-x-1/2 w-[88%] max-w-[340px] rounded-[20px] bg-background border border-primary/30 shadow-2xl p-5 transition-opacity duration-150"
        style={
          tooltipTop != null
            ? { top: tooltipTop, opacity: settled ? 1 : 0 }
            : { top: "50%", transform: "translate(-50%, -50%)", opacity: settled ? 1 : 0 }
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

        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-primary font-semibold font-body">
            <Sparkles className="size-3" />
            {current.eyebrow}
          </span>
          <span className="ml-auto text-[10px] tracking-[0.15em] text-foreground/50 font-body">
            {step + 1} / {total}
          </span>
        </div>
        <h3 className="font-display text-[20px] leading-tight">{current.title}</h3>
        <p className="text-[13.5px] text-foreground/80 font-body mt-2 leading-relaxed">
          {current.body}
        </p>

        {current.action === "add-photo" && (
          <Button
            variant="gold"
            size="pill"
            className="w-full mt-4"
            onClick={openPhotoPicker}
          >
            {current.actionLabel ?? "Add a photo now"}
          </Button>
        )}

        <div className="flex items-center gap-2 mt-4">
          {step > 0 && (
            <Button variant="goldOutline" size="pill" className="flex-1" onClick={prev}>
              Back
            </Button>
          )}
          <Button
            variant={current.action ? "goldOutline" : "gold"}
            size="pill"
            className="flex-1"
            onClick={next}
          >
            {step === total - 1 ? "Finish" : current.action ? "Later →" : "Next →"}
          </Button>
        </div>

        <div className="flex justify-center gap-1.5 mt-3">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? "w-5 bg-primary" : "w-1.5 bg-primary/25"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => finish(true)}
          className="mt-3 w-full text-center text-[11px] uppercase tracking-[0.22em] text-foreground/55 hover:text-foreground font-body font-medium"
        >
          Skip the tour
        </button>
      </div>
    </div>
  );
};

export default HomeTour;

