import { Package, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { promotionIsLive, useBrandTags, visibleTags } from "@/hooks/useBrandTags";
import type { ProductRow } from "@/hooks/useTreatmentPlans";

/**
 * PRODUCT + BRAND MARKERS on a due step.
 *
 * A little icon carries the state so the row stays glanceable:
 *   Package  — the product this step uses.
 *   Tag      — the brands credited on that product.
 * A soft dot on either icon means that piece still needs an update from her:
 * nothing logged against the step yet, or no brand credited on the product.
 */
const Marker = ({
  icon: Icon,
  label,
  needsUpdate,
}: {
  icon: typeof Package;
  label: string;
  needsUpdate?: boolean;
}) => (
  <span
    className={cn(
      "relative inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 max-w-full",
      needsUpdate ? "border-primary/50 bg-primary/10" : "border-border bg-card",
    )}
  >
    <Icon className={cn("size-3.5 shrink-0", needsUpdate ? "text-primary" : "text-muted-foreground")} />
    <span className="font-body text-[11px] leading-none break-words">{label}</span>
    {needsUpdate && (
      <span
        aria-hidden
        className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary pulse"
      />
    )}
  </span>
);

const StepProductMarkers = ({
  product,
  /** True when nothing has been logged against this step today. */
  updateDue,
  className,
}: {
  product?: ProductRow;
  updateDue: boolean;
  className?: string;
}) => {
  const { tags } = useBrandTags("treatment_plan_product", product?.id ?? null);
  const brands = visibleTags(tags);
  if (!product) return null;

  const brandNames = brands.length
    ? brands.map((t) => t.brand_name).join(", ")
    : product.brand || "";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Marker
        icon={Package}
        label={product.product_name}
        needsUpdate={updateDue}
      />
      <Marker
        icon={Tag}
        label={brandNames || "Add a brand"}
        needsUpdate={!brands.length}
      />
      {brands.some((t) => promotionIsLive(t)) && (
        <span className="font-body text-[10px] text-muted-foreground">
          {brands.find((t) => promotionIsLive(t))?.disclosure_label}
        </span>
      )}
    </div>
  );
};

export default StepProductMarkers;
