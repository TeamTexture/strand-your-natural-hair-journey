import { useLocation } from "react-router-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * OnboardingGuide — the succinct "what to do here and why" card that sits at
 * the top of every consumer onboarding screen, above the form.
 *
 * It also carries the overall position marker so the member always knows how
 * many stages are left in onboarding (the 6-stage consumer flow). This file is
 * the SINGLE SOURCE OF TRUTH for step position: TitleBar reads its counter from
 * the map below, so the header and the guide can never drift apart.
 *
 * The blood stages sit outside the count — they are optional, so they show the
 * label "Optional" and never advance the progress dots.
 *
 * Copy rules: one line of what, one short why, one line of what comes next.
 * Never a paragraph, never a duplicate of the page's own headings.
 */

const TOTAL = 6;

interface Guide {
  /** Position in the 6-stage flow. Optional stages carry the previous step. */
  step: number;
  /** Outside the counted flow (blood work) — shows "Optional" instead. */
  optional?: boolean;
  /** Name of this stage — shown next to "Step n of 6". */
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
    next: "Next: your supplements.",
  },
  "/onboarding/profile-supplements": {
    step: 3,
    label: "Supplements",
    what: "Tell us what you're already taking.",
    why: "Your nutrition guidance builds on what you already cover instead of repeating it.",
    next: "Next: your hair characteristics.",
  },
  "/onboarding/profile-step-3-hair": {
    step: 4,
    label: "Hair characteristics",
    what: "Answer six questions about your hair and scalp — porosity, elasticity, scalp condition and the rest.",
    next: "Next: colour and your current style.",
  },
  "/onboarding/profile-step-4-colour": {
    step: 5,
    label: "Colour & style",
    what: "Tell us your colour history and the style you're in or moving to.",
    why: "Colour and style decide how much moisture and manipulation your hair can take.",
    next: "Next: choose your membership.",
  },
  "/subscribe": {
    step: 6,
    label: "Membership",
    what: "Choose your membership and STRAND unlocks.",
  },
  "/onboarding/blood-timing": {
    step: 5,
    optional: true,
    label: "Blood test",
    what: "Tell us when your blood test was taken — it needs to be within the last 6 months.",
    why: "We read your iron, thyroid and vitamin levels to build your nutrition and diet guidance. The more recent your test, the more accurate that guidance is.",
    next: "Next: upload your results, or type them in.",
  },
  "/blood-upload": {
    step: 5,
    optional: true,
    label: "Your results",
    what: "Upload your blood test and check each value we read from it.",
    why: "We only use values you've confirmed — nothing is assumed.",
    next: "Then your membership, and the app unlocks.",
  },
  "/onboarding/blood-iron-vitamins": {
    step: 5,
    optional: true,
    label: "Your results",
    what: "Enter your iron and vitamin values, or mark anything you weren't tested for.",
    why: "These are the markers most closely tied to shedding and regrowth.",
    next: "Then minerals, thyroid and hormones — then your membership.",
  },
  "/onboarding/blood-minerals": {
    step: 5,
    optional: true,
    label: "Your results",
    what: "Add your mineral values, or mark them untested.",
    next: "Then thyroid and hormones — then your membership.",
  },
  "/onboarding/blood-thyroid": {
    step: 5,
    optional: true,
    label: "Your results",
    what: "Add your thyroid values, or mark them untested.",
    next: "One panel left: hormones.",
  },
  "/onboarding/blood-hormones": {
    step: 5,
    optional: true,
    label: "Your results",
    what: "Add your hormone values, or mark them untested.",
    next: "Next: confirm your membership and your app unlocks.",
  },
};

/**
 * The header counter for an onboarding path — "Step 4 of 6", or "Optional" for
 * the blood stages. Null for anything outside the flow, so TitleBar leaves the
 * slot empty. Read from the same map the guide card uses, by design.
 */
export const onboardingStepLabel = (pathname: string): string | null => {
  const guide = GUIDES[pathname];
  if (!guide) return null;
  return guide.optional ? "Optional" : `${guide.step} of ${TOTAL}`;
};


const OnboardingGuide = ({ className }: { className?: string }) => {
  const { pathname } = useLocation();
  const guide = GUIDES[pathname];
  if (!guide) return null;

  // Optional stages must not look like progress through the counted flow: the
  // dots stay exactly where the last counted step left them.
  const heading = guide.optional ? "Optional" : `Step ${guide.step} of ${TOTAL}`;

  return (
    <div className={cn("px-1", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
          {heading}
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
        aria-label={heading}
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              !guide.optional && i + 1 === guide.step
                ? "bg-primary"
                : i + 1 <= guide.step
                  ? "bg-primary/55"
                  : "bg-primary/15",
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
