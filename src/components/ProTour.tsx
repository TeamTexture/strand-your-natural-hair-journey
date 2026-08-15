import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Sparkles, Minus } from "lucide-react";

const TOUR_KEY = "strand_pro_tour_seen_v1";
const PENDING_KEY = "strand_pro_tour_pending";
const STEP_KEY = "strand_pro_tour_step";

type Step = {
  route: string;
  target: string | null; // data-tour attribute; null centres the card
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    route: "/pro/profile",
    target: null,
    eyebrow: "You're in",
    title: "Welcome to STRAND Pro",
    body: "Your subscription is live. Let's walk through everything your professional account can do — a minute, and you can skip anytime.",
  },
  {
    route: "/pro/profile",
    target: "pro-profile-form",
    eyebrow: "Step 1",
    title: "Your public profile",
    body: "This is what members see in the directory: your bio, discipline, specialisms, photos, services, contact details and opening hours. Fill it in fully — the richer it is, the more enquiries you receive.",
  },
  {
    route: "/pro",
    target: "pro-card-profile",
    eyebrow: "Step 2",
    title: "Profile",
    body: "Come back here any time to update your listing. Changes save immediately and appear on your directory card.",
  },
  {
    route: "/pro",
    target: "pro-card-directory",
    eyebrow: "Step 3",
    title: "View directory",
    body: "See your live listing exactly as members see it, sitting alongside the rest of the Strand Council.",
  },
  {
    route: "/pro",
    target: "pro-card-offers",
    eyebrow: "Step 4",
    title: "Listing discount",
    body: "Add a one-off promotion — a percentage off, a first-consultation rate — shown right on your directory listing.",
  },
  {
    route: "/pro",
    target: "pro-card-campaigns",
    eyebrow: "Step 5",
    title: "Create an offer",
    body: "Book a paid banner campaign across the app — home, products, wash day — to put your practice in front of every member for the days you choose.",
  },
  {
    route: "/pro",
    target: "pro-card-enquiries",
    eyebrow: "Step 6",
    title: "Enquiries",
    body: "Members contact you here with their goal, timeframe and budget. Accepting an enquiry unlocks their consented client passport and opens a private chat.",
  },
  {
    route: "/pro",
    target: "pro-card-messages",
    eyebrow: "Step 7",
    title: "Messages",
    body: "Private chat with accepted clients. You can book and update appointments straight from the conversation.",
  },
  {
    route: "/pro",
    target: "pro-card-clients",
    eyebrow: "Step 8",
    title: "Clients",
    body: "Your client book. Open any client's passport — hair profile, bloods, products, wash history — plus private notes only you can see.",
  },
  {
    route: "/pro",
    target: "pro-card-appointments",
    eyebrow: "Step 9",
    title: "Appointments",
    body: "Every session linked to you, in a calendar view. Confirm, reschedule or cancel, and log outcomes after the appointment.",
  },
  {
    route: "/pro",
    target: "pro-card-billing",
    eyebrow: "Step 10",
    title: "Billing",
    body: "Manage your STRAND Pro subscription, view invoices or cancel at any time from the Stripe portal.",
  },
  {
    route: "/pro",
    target: null,
    eyebrow: "You're set",
    title: "That's the whole dashboard",
    body: "Start by completing your profile so admin can publish your listing — then enquiries will begin landing in your inbox.",
  },
];

/**
 * Guided, step-by-step feature tour for professionals. Mirrors the consumer
 * HomeTour (spotlight + skip + minimise) but spans two routes: the pro
 * profile page and the pro dashboard. Auto-starts after first payment.
 */
const ProTour = () => {
  const nav = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(240);

  // Auto-start when checkout flagged the tour as pending, and resume it
  // across the profile → dashboard navigation.
  useEffect(() => {
    try {
      const seen = localStorage.getItem(TOUR_KEY);
      const pending = localStorage.getItem(PENDING_KEY);
      if (pending && !seen) {
        const saved = parseInt(sessionStorage.getItem(STEP_KEY) ?? "0", 10);
        setStep(Number.isFinite(saved) ? saved : 0);
        const t = setTimeout(() => setActive(true), 400);
        return () => clearTimeout(t);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  // Manual replay from anywhere on the pro side.
  useEffect(() => {
    const onStart = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("strand:start-pro-tour", onStart as EventListener);
    return () =>
      window.removeEventListener("strand:start-pro-tour", onStart as EventListener);
  }, []);

  const current = STEPS[step];

  // Keep the route in sync with the current step.
  useEffect(() => {
    if (!active || !current) return;
    try {
      sessionStorage.setItem(STEP_KEY, String(step));
    } catch {
      // Ignore storage failures.
    }
    if (location.pathname !== current.route) {
      nav(current.route);
    }
  }, [active, step, current, location.pathname, nav]);

  const onRoute = !!current && location.pathname === current.route;

  useLayoutEffect(() => {
    if (!active || !onRoute) return;
    if (!current?.target) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${current.target}"]`,
      );
      if (!el) {
        if (tries++ < 20) setTimeout(measure, 150);
        else setRect(null);
        return;
      }
      // Keep the highlighted panel's copy visible alongside the tour card.
      const vh = window.innerHeight;
      const box = el.getBoundingClientRect();
      if (box.height + cardH + 120 > vh) {
        window.scrollTo({ top: Math.max(0, window.scrollY + box.top - 84), behavior: "smooth" });
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setTimeout(() => {
        if (!cancelled) setRect(el.getBoundingClientRect());
      }, 320);
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
      cancelled = true;
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [active, onRoute, step, current?.target]);

  if (!active || !current || !onRoute) return null;

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
      localStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(STEP_KEY);
    } catch {
      // Ignore storage failures.
    }
    setActive(false);
  };

  const next = () => {
    if (step >= STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipTop = (() => {
    if (!rect) return null;
    const gapBelow = viewportH - rect.bottom - 14;
    const gapAbove = rect.top - 14;
    if (gapBelow >= cardH + 8) return rect.bottom + 14;
    if (gapAbove >= cardH + 8) return Math.max(12, rect.top - 14 - cardH);
    return gapBelow >= gapAbove ? Math.max(12, viewportH - cardH - 12) : 12;
  })();

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="strand-pro-tour-mask">
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
          mask="url(#strand-pro-tour-mask)"
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
          onClick={finish}
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
        <h3 className="font-display text-[20px] leading-tight">{current.title}</h3>
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
          onClick={finish}
          className="mt-3 w-full text-center text-[11px] uppercase tracking-[0.22em] text-foreground/55 hover:text-foreground font-body font-medium"
        >
          Skip the tour
        </button>
      </div>
    </div>
  );
};

export default ProTour;
