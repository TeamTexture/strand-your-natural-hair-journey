import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

// Bumped key — tour is refreshed once for every user when new steps are added.
const TOUR_KEY = "strand_home_tour_seen_v3";
const PENDING_KEY = "strand_home_tour_pending";

type Step = {
  target: string | null; // data-tour attribute; null centres the card
  eyebrow: string;
  title: string;
  body: string;
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
    target: "length-goal",
    eyebrow: "Panel 2",
    title: "Your Goal",
    body: "Whatever you're working toward — length, moisture, scalp health, breakage — sits here. STRAND reads this on every screen, so tips, wash advice and nutrition all pull toward it.",
  },
  {
    target: "blood-work",
    eyebrow: "Panel 3",
    title: "My Blood Work",
    body: "Your labs are the clinical spine of the app. Every marker is compared to healthy ranges for your heritage and life stage — flagged results power the alerts and nutrition plan.",
  },
  {
    target: "alerts",
    eyebrow: "Panel 4",
    title: "Alerts",
    body: "STRAND watches your data quietly and only nudges when it matters — a wash overdue, a style worn too long, a marker trending the wrong way. Tap any alert to act on it.",
  },
  {
    target: "quick-actions",
    eyebrow: "Quick actions",
    title: "Four one-tap shortcuts",
    body: "These four buttons are the fastest way to feed STRAND new data. Let's step through each one so you know exactly what it captures.",
  },
  {
    target: "qa-wash",
    eyebrow: "Quick action 1 of 4",
    title: "Log Wash Day",
    body: "Every wash you log — products, technique, scalp feel, breakage, styling — becomes the single richest signal STRAND uses. Your next-wash tip, product ratings and heat guidance all come from this.",
  },
  {
    target: "qa-product",
    eyebrow: "Quick action 2 of 4",
    title: "Add Product",
    body: "Scan a bottle, screenshot a page or paste a URL. STRAND reads the ingredients, rates the product against your hair profile and goal, and adds it to your shelf ready to use on wash day.",
  },
  {
    target: "qa-journal",
    eyebrow: "Quick action 3 of 4",
    title: "Style Journal",
    body: "A visual diary of every style you wear — braids, wigs, silk press, twist-outs. Photos, notes, how long you kept it in. It's how STRAND learns which styles genuinely work for your hair.",
  },
  {
    target: "qa-appt",
    eyebrow: "Quick action 4 of 4",
    title: "Appointments",
    body: "Book and track sessions with your stylist, trichologist or salon. STRAND uses these dates to time your wash rhythm, heat treatments and style ceilings around them.",
  },
  {
    target: "my-shelf",
    eyebrow: "Panel 5",
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
    target: null,
    eyebrow: "You're set",
    title: "One last thing",
    body: "You can replay this tour anytime from the ‘Take the tour’ button pinned at the top of your home screen. Now let's set your first goal so every tip starts working for you from day one.",
  },
];

const HomeTour = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  // Auto-start ONLY when onboarding just flagged the tour as pending.
  // We never auto-run for returning users on every login — they trigger it
  // manually via the pinned "Take the tour" button which dispatches an event.
  useEffect(() => {
    const startFromScratch = () => {
      setStep(0);
      setActive(true);
    };
    try {
      const seen = localStorage.getItem(TOUR_KEY);
      const pending = localStorage.getItem(PENDING_KEY);
      if (pending && !seen) {
        const t = setTimeout(startFromScratch, 400);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  // Allow the pinned Home button (or any caller) to replay the tour on demand.
  useEffect(() => {
    const onStart = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("strand:start-tour", onStart as EventListener);
    return () => window.removeEventListener("strand:start-tour", onStart as EventListener);
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
      el.scrollIntoView({ block: "center", behavior: "smooth" });
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
  }, [active, step, current?.target]);

  if (!active && !goalOpen) return null;

  const finish = (skipped = false) => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
      localStorage.removeItem(PENDING_KEY);
    } catch {}
    setActive(false);
    if (!skipped) {
      setTimeout(() => setGoalOpen(true), 250);
    }
  };

  const next = () => {
    if (step >= STEPS.length - 1) finish(false);
    else setStep((s) => s + 1);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipTop = (() => {
    if (!rect) return null;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow > 200 || spaceBelow >= spaceAbove) {
      return Math.min(rect.bottom + 14, viewportH - 260);
    }
    return Math.max(12, rect.top - 240);
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
              Set your first goal
            </DialogTitle>
            <DialogDescription className="font-body text-sm leading-relaxed">
              STRAND tailors every wash tip, product rating and nutrition suggestion to what
              you're working toward. Takes about 60 seconds.
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
              Set my goal →
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
