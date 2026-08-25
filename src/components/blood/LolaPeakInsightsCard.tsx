import { BadgeCheck } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";

/**
 * THE single commercial block for the STRAND-recommended blood panel.
 *
 * It appears in the retest routes sheet and in the onboarding blood-timing
 * screen, so it lives here rather than being maintained as two copies that
 * would drift on price, turnaround or collection method.
 *
 * Facts only, and only facts we can verify: Peak Insights 70 is a venous draw
 * taken by a phlebotomist at home or at a clinic — it is NOT a posted
 * fingerprick kit, and must never be described as one.
 */

export const LOLA_PEAK_INSIGHTS_URL =
  "https://lolahealth.com/products/peak-insights?snowball=PAIGE97471&utm_source=snowball&utm_medium=20-gbp-per-order-b2c&utm_campaign=PAIGE97471";
export const LOLA_PEAK_INSIGHTS_CODE = "PAIGE97471";

const LolaPeakInsightsCard = ({
  showHeading = true,
  showPrepNotes = true,
}: {
  showHeading?: boolean;
  showPrepNotes?: boolean;
}) => (
  <section className="space-y-2">
    {showHeading && (
      <SectionLabel className="!px-0 !mt-0">
        <span className="inline-flex items-center gap-1.5">
          <BadgeCheck className="size-3.5" aria-hidden="true" /> Recommended by STRAND
        </span>
      </SectionLabel>
    )}
    <SurfaceCard tone="gold" className="space-y-3">
      <div>
        <p className="font-display text-[15px] font-semibold leading-tight">
          Lola Health — Peak Insights 70
        </p>
        <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed mt-1">
          A phlebotomist visits you at home, or you attend a clinic. Not a posted
          fingerprick kit. Results in 2–4 working days, reviewed by a
          GMC-registered doctor.
        </p>
        <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed mt-1">
          From £200, or £235 with the at-home phlebotomist visit.
        </p>
      </div>

      <div className="rounded-md bg-primary/15 px-3 py-2 text-[12px] font-body">
        <span className="text-foreground/70">Discount code: </span>
        <span className="font-semibold tracking-wide">{LOLA_PEAK_INSIGHTS_CODE}</span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-primary/80">
          Why we chose it
        </p>
        <p className="text-[12px] font-body text-foreground/80 leading-relaxed">
          We compared the panels against the markers STRAND reads. Peak Insights
          70 is the only one that covers all four iron markers, all four thyroid
          markers and all seven hormones we track — 24 of our 32. Lola's Core
          Health 45 covers 11 and includes no thyroid panel at all.
        </p>
      </div>

      {showPrepNotes && (
        <ul className="space-y-1 text-[12px] font-body text-foreground/80 leading-relaxed">
          <li className="flex gap-2">
            <span className="mt-[6px] size-1 rounded-full bg-primary/60 shrink-0" aria-hidden="true" />
            <span>Fast for 10–12 hours before your appointment. Water is fine.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[6px] size-1 rounded-full bg-primary/60 shrink-0" aria-hidden="true" />
            <span>Book a morning slot if you can — cortisol is best measured between 8 and 10am.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[6px] size-1 rounded-full bg-primary/60 shrink-0" aria-hidden="true" />
            <span>If you are tracking hormones, days 2–5 of your cycle are usually recommended for FSH, LH and oestradiol.</span>
          </li>
        </ul>
      )}

      <a
        href={LOLA_PEAK_INSIGHTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center h-10 rounded-pill bg-primary text-primary-foreground font-body font-medium text-[12.5px] w-full hover:bg-primary/90 transition-colors"
      >
        Order Peak Insights 70 →
      </a>

      <p className="text-[11px] font-body text-foreground/60 leading-relaxed">
        STRAND earns a commission on orders placed through this link.
      </p>

      <p className="text-[11px] font-body text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
        Lola reports Active B12, not total B12. Enter that result in the Active
        B12 field.
      </p>
    </SurfaceCard>
  </section>
);

export default LolaPeakInsightsCard;
