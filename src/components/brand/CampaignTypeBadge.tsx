import { cn } from "@/lib/utils";

export type OwnerType = "brand" | "pro";

/**
 * Small on-system pill identifying whether a promotion was submitted by
 * a BRAND (ink-tone) or a PROFESSIONAL (gold-tone). Used across every
 * admin surface where campaigns appear so type is legible at a glance.
 */
const CampaignTypeBadge = ({
  ownerType,
  className,
}: {
  ownerType: OwnerType | null | undefined;
  className?: string;
}) => {
  const isPro = ownerType === "pro";
  return (
    <span
      className={cn(
        "inline-flex items-center text-[9px] font-body font-semibold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full leading-none shrink-0",
        isPro
          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
          : "bg-foreground/85 text-background",
        className,
      )}
      aria-label={isPro ? "Professional campaign" : "Brand campaign"}
    >
      {isPro ? "Pro" : "Brand"}
    </span>
  );
};

export default CampaignTypeBadge;
