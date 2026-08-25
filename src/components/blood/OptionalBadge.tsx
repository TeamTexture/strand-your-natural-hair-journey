import { cn } from "@/lib/utils";

/**
 * Small gold pill that says a step is optional. Sits as the FIRST element of a
 * card, above the heading, so the fact is read before anything else rather than
 * skimmed past in body copy.
 */
const OptionalBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-pill bg-primary/15 px-2.5 py-0.5",
      "font-body text-[10px] font-semibold uppercase tracking-[0.12em] text-primary",
      className,
    )}
  >
    Optional
  </span>
);

export default OptionalBadge;
