import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, Sparkles, Minus } from "lucide-react";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures } from "@/lib/viewFeatures";
import {
  consumeTourAutostart,
  markTourFinished,
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
    body: "STRAND has read your profile, your bloods and your goals. Let's take a quick walk through every part of the app — 60 seconds, and you can skip anytime.",
  },
  {
    target: "current-style",
    eyebrow: "Panel 1",
    title: "Your Current Style",
    body: "The style you're wearing right now, plus what's planned next. Tap it any time to open your full Strand Summary — the clinical fingerprint we build every recommendation from.",
  },
  {
    target: "goals",
    eyebrow: "Panel 2",
    title: "Your hair care goals",
    body: "Whatever you're working towards, in your own words — there's no list to pick from. STRAND reads this on every screen, so tips, wash advice and nutrition all pull toward it.",
  },
  {
    target: "challenges",
    eyebrow: "Panel 3",
    title: "Your hair care challenges",
    body: "What's getting in the way right now — shedding, dryness by week two, no time on wash day. Kept separate from your goals, and just as important to the guidance you get.",
  },
  {
    target: "blood-work",
    eyebrow: "Panel 4",
    title: "My Blood Work",
    body: "Your labs are the clinical spine of the app. Every marker is compared to healthy ranges for your heritage and life stage — flagged results power the alerts and nutrition plan.",
  },
  {
    target: "alerts",
    eyebrow: "Panel 5",
    title: "Alerts",
    body: "STRAND watches your data quietly and only nudges when it matters — a wash overdue, a style worn too long, a marker trending the wrong way. Tap any alert to act on it.",
  },
  {
    target: "quick-actions",
    eyebrow: "Quick actions",
    title: "One-tap shortcuts",
    body: "These are the fastest way to feed STRAND new data or jump somewhere useful. Let's step through each one so you know exactly what it does.",
  },
  {
    target: "qa-wash",
    eyebrow: "Shortcut — Log Wash Day",
    title: "Log Wash Day",
    body: "Every wash you log — products, technique, scalp feel, breakage, styling — becomes the single richest signal STRAND uses. Your next-wash tip, product ratings and heat guidance all come from this.",
  },
  {
    target: "qa-product",
    eyebrow: "Shortcut — Add Product",
    title: "Add Product",
    body: "Scan a bottle, screenshot a page or paste a URL. STRAND reads the ingredients, rates the product against your hair profile and goal, and adds it to your shelf ready to use on wash day.",
  },
  {
    target: "qa-journal",
    eyebrow: "Shortcut — Style Journal",
    title: "Style Journal",
    body: "A visual diary of every style you wear — braids, wigs, silk press, twist-outs. Photos, notes, how long you kept it in. It's how STRAND learns which styles genuinely work for your hair.",
  },
  {
    target: "qa-appt",
    eyebrow: "Shortcut — Appointments",
    title: "Appointments",
    body: "Book and track sessions with your stylist, trichologist or salon. STRAND uses these dates to time your wash rhythm, heat treatments and style ceilings around them.",
  },
  {
    target: "qa-brands",
    eyebrow: "Shortcut — Brand directory",
    title: "Brand directory",
    body: "Browse the brands on STRAND and the products they make. Open any brand to see their range, current offers and how their products score against your hair profile.",
  },
  {
    target: "qa-pros",
    eyebrow: "Shortcut — Professional directory",
    title: "Professional directory",
    body: "Find vetted stylists, loctitians and trichologists. Read their specialisms, book a consultation, and — only if you choose to share it — let them see your Strand summary.",
  },
  {
    target: "qa-moodboards",
    eyebrow: "Shortcut — Moodboards",
    title: "Moodboards",
    body: "Save style inspiration in one place — screenshots, links, photos you love. Bring a board to your next appointment so your stylist can see exactly what you're after.",
  },
  {
    target: "qa-discounts",
    eyebrow: "Shortcut — Discounts & offers",
    title: "Discounts & offers",
    body: "Your member-only perks: brand discount codes and offers available to you right now. Codes are yours to use directly at checkout with the brand.",
  },
  {
    target: "my-shelf",
    eyebrow: "Panel 6",
    title: "My Shelf",
    body: "Everything you own, rated by STRAND against your hair profile and goals. Tap a product to see how well it fits you and how to get the most out of it.",
  },
  {
    target: "bottom-nav",
    eyebrow: "Navigation",
    title: "Your bottom bar",
    body: "Home · Products · Wash Day · Diet · Profile. These five tabs are always with you — jump between the core sections of STRAND from any screen.",
  },
  {
    target: "bottom-nav-profile",
    eyebrow: "Profile tab",
    title: "Update your details here",
    body: "Your Profile tab is where you edit hair type, health profile, medications, current style, photos and anything else STRAND uses to personalise. Update it whenever anything changes — the guidance updates with you.",
  },
  {
    target: "global-menu",
    eyebrow: "Top-right menu",
    title: "The full menu lives here",
    body: "Tap the menu icon top-right on any screen to jump straight to Blood Work, Nutrition, Directory, Style Journal, Help, Contact or Sign out. It's the shortcut to everywhere else in STRAND.",
  },
  {
    target: "nav-products",
    route: "/products",
    eyebrow: "Tab 2 — Products",
    title: "Your product shelf",
    body: "Everything you own lives here, scored against your hair profile. Add a product by scanning the bottle or pasting a link, then tap any product to see how it fits you and how to use it.",
  },
  {
    target: "nav-wash-day",
    route: "/wash-day",
    eyebrow: "Tab 3 — Wash Day",
    title: "Log a wash in five short steps",
    body: "Start a wash day here and STRAND walks you through cleanse, condition, styling and how your scalp felt. Log it as you go — it's the single richest signal your guidance is built from.",
  },
  {
    target: "nav-diet",
    route: "/nutrition-plan",
    eyebrow: "Tab 4 — Diet",
    title: "Your nutrition plan",
    body: "Built from your blood work and your diet pattern: supplements to consider, foods to prioritise, and what to keep apart from what. Open any card for the detail.",
  },
  {
    target: "bottom-nav-profile",
    route: "/profile",
    eyebrow: "Tab 5 — Profile",
    title: "Keep your details current",
    body: "Hair type, health, medications, current style, photos and your support level all live here. Update anything that changes and your guidance updates with you.",
  },
  {
    target: null,
    eyebrow: "You're set",
    title: "Two things to do first",
    route: "/home",
    body: "You can replay this tour anytime from the ‘Take the tour’ button pinned at the top of your home screen. Now add your goal and the challenge you're facing — those two answers are what STRAND builds every tip around.",
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
  const [goalOpen, setGoalOpen] = useState(false);

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
  useEffect(() => {
    if (!tourEligible) return;
    const requested = consumeTourAutostart();
    if (!requested && location.pathname !== "/home") return;
    const t = setTimeout(() => {
      if (location.pathname !== "/home") navigate("/home");
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

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="max-w-[340px] rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[22px] leading-tight">
              Add your goal and your challenge
            </DialogTitle>
            <DialogDescription className="font-body text-sm leading-relaxed">
              Your goal is what you're working toward. Your challenge is what's getting in the
              way right now — breakage, dryness, an itchy scalp, thinning edges. STRAND needs
              both to tailor every wash tip, product rating and nutrition suggestion. Takes
              about 60 seconds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => {
                setGoalOpen(false);
                navigate("/journal");
              }}
            >
              Add goal &amp; challenge →
            </Button>

            <Button
              variant="goldGhost"
              size="pill"
              className="w-full"
              onClick={() => setGoalOpen(false)}
            >
              Later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HomeTour;
