import { CheckCircle2, Sparkles, Droplet, FlaskConical, BookOpen, Camera, Users, Calendar, Leaf, Stethoscope, Heart, ShieldCheck, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import HairStrandIcon from "@/components/HairStrandIcon";

/**
 * The membership marketing content, extracted verbatim from Subscribe.tsx so
 * that /subscribe and /start-trial cannot drift apart. Every section, heading,
 * eyebrow and line here is Paige's approved wording — do not rewrite, shorten
 * or reorder it, and never add new hair-care claims here.
 */

type Pillar = { icon: LucideIcon; title: string; benefit: string };

export const PILLARS: Pillar[] = [
  {
    icon: BookOpen,
    title: "Your personal guide",
    benefit: "Expert guidance tailored to your hair, health and history.",
  },
  {
    icon: Droplet,
    title: "Wash days that count",
    benefit: "Log, schedule and perfect every cleanse, treat and seal.",
  },
  {
    icon: FlaskConical,
    title: "Product intelligence",
    benefit: "Scan, analyse and curate a shelf that actually works for you.",
  },
  {
    icon: Stethoscope,
    title: "Vetted professionals",
    benefit: "Search the directory, book, and keep every appointment in one place.",
  },
  {
    icon: Camera,
    title: "Your hair archive",
    benefit: "Milestones, moodboards, colour and appointment photos in one place.",
  },
  {
    icon: Users,
    title: "The Client Passport",
    benefit: "Walk into any chair with your full story ready to share.",
  },
  {
    icon: Calendar,
    title: "Journaling that listens",
    benefit: "Track goals, moods and appointments with gentle AI prompts.",
  },
  {
    icon: Leaf,
    title: "Rooted in the book",
    benefit: "No fads. Every insight is grounded in How To Love Your Afro.",
  },
];

export const REASSURANCE = [
  { icon: Lock, title: "Cancel any time", body: "One tap in the billing portal. No calls, no forms, no guilt." },
  { icon: ShieldCheck, title: "Your data is yours", body: "Encrypted, private, and never sold. Pause your membership and it waits for you." },
  { icon: Sparkles, title: "Always improving", body: "New features and refinements every month, included at no extra cost." },
];

export const PLUS_EXTRAS = [
  "Community forum — for members only",
  "Member-to-member chat",
  "Courses, ebooks & videos library",
  "Members-only events (digital & in person)",
];

/** "What's inside" eyebrow, heading and supporting line. */
export const WhatsInsideHeader = () => (
  <div className="text-center pt-2 space-y-2">
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brown/10 border border-brown/20">
      <HairStrandIcon className="h-3.5 w-auto text-brown" />
      <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-brown">
        What's inside
      </span>
    </div>
    <h2 className="font-display text-2xl font-semibold text-foreground">
      Every pillar, one hair story
    </h2>
    <p className="font-body text-[12.5px] text-foreground/70 leading-relaxed max-w-[300px] mx-auto">
      Every feature in STRAND is designed to answer one question: what does{" "}
      <span className="italic">your</span> hair need next?
    </p>
  </div>
);

/** The eight dark-brown pillar blocks with gold numbering. */
export const PillarSection = () => (
  <div className="relative">
    <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-56 h-56 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
    <div className="relative space-y-2.5">
      {PILLARS.map((p, i) => {
        const Icon = p.icon;
        return (
          <div
            key={p.title}
            className="relative overflow-hidden rounded-[14px] p-4 flex items-center gap-4 border border-primary/30 bg-brown text-brown-foreground"
          >
            <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-primary" />
            <div className="size-11 shrink-0 rounded-full flex items-center justify-center bg-primary/15 text-primary border border-primary/30">
              <Icon className="size-[20px]" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-body font-bold uppercase tracking-[0.22em] text-primary/80 mb-0.5">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="font-display text-[15px] font-semibold leading-[1.2] text-brown-foreground mb-0.5">
                {p.title}
              </h3>
              <p className="font-body text-[11.5px] leading-snug text-brown-foreground/80">
                {p.benefit}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/** Blood work — included in the same membership, opens when she adds results. */
export const BloodWorkCard = () => (
  <SurfaceCard>
    <div className="flex items-start gap-3">
      <Heart className="size-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-display text-[15px] font-semibold leading-snug">
          The diet and nutrition side opens when you add blood results
        </p>
        <p className="font-body text-[12px] text-foreground/75 leading-snug mt-1">
          It is part of the same membership, not an extra. Your nutrition plan and marker
          readings need your iron, ferritin, vitamin D, B12 and thyroid values, so they stay
          closed until those are on file. Blood work is optional and you can add it any time.
        </p>
      </div>
    </div>
  </SurfaceCard>
);

/** Cancel any time / your data is yours / always improving. */
export const ReassuranceStrip = () => (
  <div className="space-y-2 pt-1">
    {REASSURANCE.map((r) => {
      const Icon = r.icon;
      return (
        <div key={r.title} className="flex items-start gap-3 p-4 rounded-[14px] border border-border bg-card">
          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-[13px] font-semibold text-foreground">{r.title}</p>
            <p className="font-body text-[12px] text-foreground/70 leading-snug mt-0.5">{r.body}</p>
          </div>
        </div>
      );
    })}
  </div>
);

/** The STRAND+ inclusions list, shown when the plus tier is selected. */
export const PlusExtrasList = () => (
  <ul className="rounded-[14px] border border-primary/30 bg-primary/5 p-3 space-y-1.5">
    {PLUS_EXTRAS.map((f) => (
      <li key={f} className="flex items-start gap-2 text-[12px] font-body text-foreground/85">
        <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
        <span>{f}</span>
      </li>
    ))}
  </ul>
);

/** Advisory notes — informational only, never a blocker or a link out. */
export const AdvisoryNotes = () => (
  <div className="pt-4 border-t border-border/60 space-y-3">
    <div className="rounded-[14px] border border-primary/25 bg-primary/[0.06] p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12">
          <Droplet className="size-3.5 text-primary" aria-hidden />
        </span>
        <p className="text-[12.5px] font-body leading-snug text-foreground/80">
          Adding your blood results opens the nutrition and diet side of STRAND.
        </p>
      </div>
    </div>

    <div className="rounded-[14px] border border-primary/25 bg-primary/[0.06] p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12">
          <Stethoscope className="size-3.5 text-primary" aria-hidden />
        </span>
        <p className="text-[12.5px] font-body leading-snug text-foreground/80">
          We strongly recommend a professional consultation. Your recommendations are
          built on your hair characteristics, so having them measured by a professional
          — and kept up to date — makes everything STRAND tells you more accurate.
        </p>
      </div>
    </div>
  </div>
);

/**
 * The gold price card. Shared by /subscribe and /start-trial — the trial page
 * passes `trial` so the headline reads "£0 today", and omits `children` so the
 * only call to action stays in its pinned footer.
 */
export const PriceCard = ({
  price,
  tier,
  trial = false,
  children,
}: {
  /** Monthly price in pounds, from the live pricing source. */
  price: number;
  tier: "standard" | "plus";
  /** Free-trial framing: "£0 today", then the monthly price beneath. */
  trial?: boolean;
  /** Optional CTA rendered inside the card (Subscribe only). */
  children?: React.ReactNode;
}) => {
  const perDay = (price / 30).toFixed(2);
  const planName = tier === "plus" ? "STRAND+" : "STRAND";
  return (
    <SurfaceCard tone="gold" className="!p-5 space-y-4 text-center">
      <div>
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
          {trial
            ? `Free for 3 days, then ${planName}`
            : tier === "plus"
              ? "STRAND+ membership"
              : "Monthly membership"}
        </p>
        <div className="mt-2 flex items-baseline justify-center gap-1.5">
          <span className="font-display text-[44px] font-semibold leading-none text-foreground">
            {trial ? "£0" : `£${price.toFixed(2)}`}
          </span>
          <span className="font-body text-sm text-foreground/70">
            {trial ? "today" : "/ month"}
          </span>
        </div>
        <p className="text-[12px] font-body text-foreground/70 mt-1.5 leading-snug">
          {trial ? (
            <>
              Then £{price.toFixed(2)} a month — roughly{" "}
              <span className="font-semibold text-foreground">£{perDay} a day</span>.
            </>
          ) : (
            <>
              Roughly <span className="font-semibold text-foreground">£{perDay} a day</span>.
            </>
          )}
        </p>
      </div>
      {children}
    </SurfaceCard>
  );
};

/** Stripe / data-retention footnote. */
export const PaymentsNote = () => (
  <p className="text-[11px] text-foreground/50 font-body text-center leading-relaxed">
    Payments processed securely by Stripe. Your data is never deleted if your
    membership lapses — access is restored the moment you resubscribe.
  </p>
);

/**
 * The complete marketing block between the plan selection and the payment
 * footer, in Subscribe's order. Used by both /subscribe and /start-trial.
 */
export const MembershipMarketing = () => (
  <>
    <WhatsInsideHeader />
    <PillarSection />
    <BloodWorkCard />
    <ReassuranceStrip />
  </>
);

export default MembershipMarketing;
