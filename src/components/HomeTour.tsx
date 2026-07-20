import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const TOUR_KEY = "strand_home_tour_seen_v1";

type Step = {
  target: string | null; // data-tour attribute, or null for centered welcome/finish card
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: null,
    title: "Welcome to STRAND",
    body: "Let's take a quick tour of your home screen so you know where everything lives. It only takes 30 seconds — skip anytime.",
  },
  {
    target: "current-style",
    title: "Your Current Style",
    body: "See what you're wearing now and what's planned next. Tap to see your full Strand Summary — your hair fingerprint.",
  },
  {
    target: "length-goal",
    title: "Length Goal",
    body: "Track your growth journey. Set a target length and STRAND will guide every wash-day tip toward it.",
  },
  {
    target: "blood-work",
    title: "My Blood Work",
    body: "Your lab results power personalised advice. Upload a PDF or photo and STRAND reads it for you.",
  },
  {
    target: "alerts",
    title: "Alerts",
    body: "Timely nudges based on your data — wash reminders, low markers, styles worn too long. Tap to act, or dismiss.",
  },
  {
    target: "quick-actions",
    title: "Quick Actions",
    body: "One-tap access to log a wash day, add a product, journal a style, or book an appointment.",
  },
  {
    target: "my-shelf",
    title: "My Shelf",
    body: "Every product you own, rated by STRAND against your hair profile. Tap any product to see how it fits you.",
  },
  {
    target: null,
    title: "You're all set",
    body: "Next up: set your first goal so STRAND can tailor every tip to what you're working toward.",
  },
];

const HomeTour = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Only start the tour once per user on this device.
  useEffect(() => {
    try {
      const seen = localStorage.getItem(TOUR_KEY);
      if (!seen) {
        // small delay so Home has laid out
        const t = setTimeout(() => setActive(true), 350);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const current = STEPS[step];

  // Measure the highlighted element on every step change / scroll / resize.
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
      // Give the scroll a beat to settle before measuring.
      requestAnimationFrame(() => {
        setRect(el.getBoundingClientRect());
      });
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

  if (!active) return null;

  const finish = (skipped = false) => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {}
    setActive(false);
    if (!skipped) {
      // Prompt the user to set a goal so STRAND can personalise from day one.
      setTimeout(() => {
        toast("Set your first goal to get started", {
          description: "STRAND tailors every tip to your goal — takes 60 seconds.",
          action: {
            label: "Set goal",
            onClick: () => navigate("/journal"),
          },
          duration: 12000,
        });
      }, 500);
    }
  };

  const next = () => {
    if (step >= STEPS.length - 1) {
      finish(false);
    } else {
      setStep((s) => s + 1);
    }
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  // Build the tooltip position. When we have a rect, place below (or above
  // if there's no room). Otherwise centre it.
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipTop = (() => {
    if (!rect) return null;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow > 180 || spaceBelow >= spaceAbove) {
      return Math.min(rect.bottom + 12, viewportH - 240);
    }
    return Math.max(12, rect.top - 220);
  })();

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* Dim overlay with a punched-out highlight rectangle */}
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
          fill="rgba(15, 12, 10, 0.72)"
          mask="url(#strand-tour-mask)"
        />
      </svg>

      {/* Highlight ring */}
      {rect && (
        <div
          className="absolute rounded-[24px] border-2 border-primary shadow-[0_0_0_4px_rgba(197,160,89,0.18)] pointer-events-none animate-in fade-in"
          style={{
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      {/* Skip button, top-right */}
      <button
        onClick={() => finish(true)}
        aria-label="Skip tour"
        className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-white/85 hover:text-white bg-black/40 backdrop-blur px-3 py-2 rounded-full"
      >
        Skip tour
        <X className="size-3.5" />
      </button>

      {/* Tooltip card */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[86%] max-w-[340px] rounded-[18px] bg-background border border-primary/30 shadow-2xl p-5"
        style={
          tooltipTop != null
            ? { top: tooltipTop }
            : { top: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold font-body">
          Step {step + 1} of {STEPS.length}
        </p>
        <h3 className="font-display text-xl leading-tight mt-1.5">
          {current.title}
        </h3>
        <p className="text-sm text-foreground/80 font-body mt-2 leading-relaxed">
          {current.body}
        </p>

        <div className="flex items-center gap-2 mt-4">
          {step > 0 && (
            <Button
              variant="goldOutline"
              size="pill"
              className="flex-1"
              onClick={prev}
            >
              Back
            </Button>
          )}
          <Button
            variant="gold"
            size="pill"
            className="flex-1"
            onClick={next}
          >
            {step === STEPS.length - 1 ? "Finish" : "Next →"}
          </Button>
        </div>

        {/* Progress dots */}
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
      </div>
    </div>
  );
};

export default HomeTour;
