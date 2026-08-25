import { useLocation } from "react-router-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * OnboardingGuide — the succinct "what to do here and why" card that sits at
 * the top of every consumer onboarding screen, above the form.
 *
 * It also carries the overall position marker so the member always knows how
 * many stages are left in onboarding (the 9-stage consumer flow).
 *
 * Copy rules: one line of what, one short why, one line of what comes next.
 * Never a paragraph, never a duplicate of the page's own headings.
 */

const TOTAL = 9;

interface Guide {
  step: number;
  /** Name of this stage — shown next to "Step n of 9". */
  label: string;
  /** What to do on this page. */
  what: string;
  /** Why it matters. Optional. */
  why?: string;
  /** What happens after this page. */
  next?: string;
}

const GUIDES: Record<string, Guide> = {
  "/onboarding/profile-step-1": {
    step: 1,
    label: "About you",
    what: "Tell us who you are and where you are — a few basics only.",
    why: "Your location sets your water hardness, which changes how your hair behaves.",
    next: "Next: your health profile.",
  },
  "/onboarding/profile-step-2": {
    step: 2,
    label: "Health profile",
    what: "Answer every health question honestly — there are no defaults.",
    why: "Hair responds to what is happening inside the body, so blanks weaken your guidance.",
    next: "Next: your hair analysis.",
  },
  "/onboarding/pro-gate": {
    step: 3,
    label: "Hair analysis",
    what: "Tell us whether a hair professional has assessed your hair in the last 6 months. An appointment you have already had counts.",
    why: "Your plan is only as good as the data behind it, so we want it measured, not guessed.",
    next: "No recent assessment? Book one below — we'll hold your place.",
  },
  "/onboarding/pro-book": {
    step: 3,
    label: "Book a professional",
    what: "Pick a verified professional and book your consultation.",
    why: "We verify every professional so your characteristics come from someone qualified.",
    next: "This is a marathon, not a sprint. Open STRAND with them at the appointment and fill in your characteristics together.",
  },
  "/onboarding/pro-details": {
    step: 4,
    label: "Your professional",
    what: "Confirm who assessed your hair and when.",
    why: "We check the assessment is recent, because hair changes.",
    next: "Next: your hair characteristics.",
  },
  "/onboarding/profile-step-3-hair": {
    step: 5,
    label: "Hair characteristics",
    what: "Enter the characteristics your professional gave you — porosity, density, texture and the rest.",
    next: "Next: colour and your current style.",
  },
  "/onboarding/profile-step-4-colour": {
    step: 6,
    label: "Colour & style",
    what: "Tell us your colour history and the style you're in or moving to.",
    why: "Colour and style decide how much moisture and manipulation your hair can take.",
    next: "Next: your blood test.",
  },
  "/onboarding/blood-timing": {
    step: 7,
    label: "Blood test",
    what: "Tell us when your blood test was taken — it needs to be within the last 6 months.",
    why: "Iron, thyroid and vitamin levels shape shedding and growth more than any product.",
    next: "Next: upload your results, or type them in.",
  },
  "/blood-upload": {
    step: 8,
    label: "Your results",
    what: "Upload your blood test and check each value we read from it.",
    why: "We only use values you've confirmed — nothing is assumed.",
    next: "Last step: confirm your membership, then the app unlocks.",
  },
  "/onboarding/blood-iron-vitamins": {
    step: 8,
    label: "Your results",
    what: "Enter your iron and vitamin values, or mark anything you weren't tested for.",
    why: "These are the markers most closely tied to shedding and regrowth.",
    next: "Then minerals, thyroid and hormones — then your membership.",
  },
  "/onboarding/blood-minerals": {
    step: 8,
    label: "Your results",
    what: "Add your mineral values, or mark them untested.",
    next: "Then thyroid and hormones — then your membership.",
  },
  "/onboarding/blood-thyroid": {
    step: 8,
    label: "Your results",
    what: "Add your thyroid values, or mark them untested.",
    next: "One panel left: hormones.",
  },
  "/onboarding/blood-hormones": {
    step: 8,
    label: "Your results",
    what: "Add your hormone values, or mark them untested.",
    next: "Next: confirm your membership and your app unlocks.",
  },
};

const OnboardingGuide = ({ className }: { className?: string }) => {
  const { pathname } = useLocation();
  const guide = GUIDES[pathname];
  if (!guide) return null;

  return (
    <div className={cn("px-1", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
          Step {guide.step} of {TOTAL}
        </p>
        <p className="text-[11px] font-body text-muted-foreground truncate max-w-[55%]">
          {guide.label}
        </p>
      </div>
      <div
        className="mt-2 flex items-center gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={TOTAL}
        aria-valuenow={guide.step}
        aria-label={`Step ${guide.step} of ${TOTAL}`}
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              i + 1 === guide.step ? "bg-primary" : i + 1 < guide.step ? "bg-primary/55" : "bg-primary/15",
            )}
          />
        ))}
      </div>

      <section className="mt-3 rounded-[14px] border border-primary/25 bg-primary/[0.06] p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12">
            <Info className="size-3.5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-foreground font-body [overflow-wrap:anywhere]">
              {guide.what}
            </p>
            {guide.why && (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground font-body [overflow-wrap:anywhere]">
                {guide.why}
              </p>
            )}
            {guide.next && (
              <p className="mt-2 text-[11.5px] leading-snug text-primary font-body [overflow-wrap:anywhere]">
                {guide.next}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OnboardingGuide;
