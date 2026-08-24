import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Sparkles, Minus } from "lucide-react";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures } from "@/lib/viewFeatures";
import {
  consumeTourAutostart,
  markTourFinished,
  setTourActive,
  TOUR_START_EVENT,
} from "@/lib/firstRunTour";

// Bumped key — tour is refreshed once for every user when new steps are added.
const TOUR_KEY = "strand_home_tour_seen_v3";
const PENDING_KEY = "strand_home_tour_pending";

type Step = {
  target: string | null; // data-tour attribute; null centres the card
  eyebrow: string;
  title: string;
  body: string;
  /** Route this step is explained on. Defaults to Home. */
  route?: string;
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
    target: "goals",
    eyebrow: "Home",
    title: "Your goal",
    body: "What you're working towards, in your own words. STRAND reads it on every screen, so tips, wash advice and nutrition all pull toward it.",
  },
  {
    target: "challenges",
    eyebrow: "Home",
    title: "Your challenges",
    body: "What's getting in the way right now — shedding, dryness by week two, no time on wash day. Keep it current and the guidance follows.",
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
    target: null,
    route: "/home",
    eyebrow: "You're set",
    title: "One thing to do first",
    body: "You can replay this tour anytime from the ‘Take the tour’ button on your home screen. Next: your goal and your challenge — the two answers STRAND builds every tip around.",
  },
];

const HomeTour = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const view = useActiveRoleView();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(240);

  // Auto-start ONLY when onboarding just flagged the tour as pending.
  // We never auto-run for returning users on every login — they trigger it
  // manually via the pinned "Take the tour" button which dispatches an event.
  // Auto-start the first time a paid member reaches Home. Onboarding flags the
  // tour as pending, but members who paid outside that flow (or resumed on a
  // new device) must still get it — the "seen" flag is the only guard, so it
  // never replays for someone who has already been through it.
  const { eligible: tourEligible, markSeen: markTourSeen } = useFirstRunNudge("home_tour_seen_at");

  // The tour opens when the member taps the glowing START HERE beacon on the
  // Home tab (which sets the autostart flag), and — as a safety net — the first
  // time an eligible member is already sitting on Home. It never replays.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!tourEligible) return;
    // One auto-start per session: without this the effect re-fires after the
    // tour finishes (the "seen" write has not round-tripped yet) and the member
    // is thrown back to step 1.
    if (startedRef.current) return;
    const requested = consumeTourAutostart();
    if (!requested && location.pathname !== "/home") return;
    const t = setTimeout(() => {
      if (location.pathname !== "/home") navigate("/home");
      startedRef.current = true;
      setStep(0);
      setActive(true);
      markTourSeen();
      try {
        localStorage.setItem(TOUR_KEY, "1");
      } catch {}
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourEligible, location.pathname, markTourSeen]);

  // Walk the member to the page a step belongs to before measuring its anchor.
  // Broadcast so other first-run dialogs stand down while the tour is on screen.
  useEffect(() => {
    setTourActive(active);
    return () => setTourActive(false);
  }, [active]);

  const stepRoute = STEPS[step]?.route ?? "/home";
  useEffect(() => {
    if (!active) return;
    if (location.pathname !== stepRoute) navigate(stepRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, stepRoute]);


  // Allow the pinned Home button (or any caller) to replay the tour on demand.
  useEffect(() => {
    const onStart = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener(TOUR_START_EVENT, onStart as EventListener);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart as EventListener);
  }, []);

  const current = STEPS[step];

  useLayoutEffect(() => {
    if (!active) return;
    if (!current?.target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${current.target}"]`,
      );
      if (!el) {
        setRect(null);
        return;
      }
      // Scroll so the highlighted panel AND the tour card can both be seen.
      // Centring hides the copy behind the card whenever the panel is tall, so
      // we park the panel just under the header and keep the space below free.
      const vh = window.innerHeight;
      const box = el.getBoundingClientRect();
      const needsRoom = box.height + cardH + 120 > vh;
      if (needsRoom) {
        const y = window.scrollY + box.top - 84;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    measure();
    const onScroll = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${current.target}"]`,
      );
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [active, step, current?.target, location.pathname]);

  if (!allowsMemberFeatures(view)) return null;
  if (!active) return null;

  const finish = (_skipped = false) => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
      localStorage.removeItem(PENDING_KEY);
    } catch {}
    setActive(false);
    // Whether completed or skipped, the tour always hands over to the
    // mandatory goal + challenge gate (see FirstRunSequence) on Home.
    if (location.pathname !== "/home") navigate("/home");
    setTimeout(() => markTourFinished(), 250);
  };


  const next = () => {
    if (step >= STEPS.length - 1) finish(false);
    else setStep((s) => s + 1);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipTop = (() => {
    if (!rect) return null;
    const gapBelow = viewportH - rect.bottom - 14;
    const gapAbove = rect.top - 14;
    // Prefer whichever side actually fits the card, so the panel copy the tour
    // is talking about is never covered.
    if (gapBelow >= cardH + 8) return rect.bottom + 14;
    if (gapAbove >= cardH + 8) return Math.max(12, rect.top - 14 - cardH);
    return gapBelow >= gapAbove
      ? Math.max(12, viewportH - cardH - 12)
      : 12;
  })();

  return (
    <>
      {active && (
        <div className="fixed inset-0 z-[100] pointer-events-auto">
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <mask id="strand-tour-mask">
                <rect width="100%" height="100%" fill="white" />
                {rect && (
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

          {rect && (
            <div
              className="absolute rounded-[24px] border-2 border-primary shadow-[0_0_0_6px_rgba(197,160,89,0.22)] pointer-events-none animate-pulse"
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
            className="absolute left-1/2 -translate-x-1/2 w-[88%] max-w-[340px] rounded-[20px] bg-background border border-primary/30 shadow-2xl p-5"
            style={
              tooltipTop != null
                ? { top: tooltipTop }
                : { top: "50%", transform: "translate(-50%, -50%)" }
            }
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-primary font-semibold font-body">
                <Sparkles className="size-3" />
                {current.eyebrow}
              </span>
              <span className="ml-auto text-[10px] tracking-[0.15em] text-foreground/50 font-body">
                {step + 1} / {STEPS.length}
              </span>
            </div>
            <h3 className="font-display text-[20px] leading-tight">
              {current.title}
            </h3>
            <p className="text-[13.5px] text-foreground/80 font-body mt-2 leading-relaxed">
              {current.body}
            </p>

            <div className="flex items-center gap-2 mt-4">
              {step > 0 && (
                <Button variant="goldOutline" size="pill" className="flex-1" onClick={prev}>
                  Back
                </Button>
              )}
              <Button variant="gold" size="pill" className="flex-1" onClick={next}>
                {step === STEPS.length - 1 ? "Finish" : "Next →"}
              </Button>
            </div>

            <div className="flex justify-center gap-1.5 mt-3">
              {STEPS.map((_, i) => (
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
      )}

    </>
  );
};

export default HomeTour;
