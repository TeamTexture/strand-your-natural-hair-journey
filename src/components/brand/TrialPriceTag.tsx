import { IS_TRIAL_PRICING } from "@/lib/adPricing";

/** Quiet factual tag shown beside every rate while introductory pricing runs.
 *  Renders nothing when IS_TRIAL_PRICING is false. */
const TrialPriceTag = ({ className = "" }: { className?: string }) => {
  if (!IS_TRIAL_PRICING) return null;
  return (
    <span
      className={`inline-flex items-center rounded-pill border border-primary/40 bg-primary/5 px-1.5 py-[1px] text-[9px] uppercase tracking-[0.12em] text-primary font-body align-middle ${className}`}
    >
      Trial price
    </span>
  );
};

export default TrialPriceTag;
