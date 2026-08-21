// THE shelf product card. One component, three surfaces:
//   • the member's own shelf (src/pages/Products.tsx)
//   • a brand's own shelf (src/pages/brand/BrandShelf.tsx)
//   • a brand's public page listing (src/components/brand/BrandShelfSection.tsx)
//
// Anything surface-specific arrives as a slot (`chips`, `headerActions`,
// `footer`, `children`) so no surface ever needs a lookalike card. If a new
// listing needs a product row, use this — do not copy it.

import type { ReactNode } from "react";
import ProductThumb from "@/components/ProductThumb";
import SensitivityShelfAlert, {
  useSensitivityAdjustedScore,
} from "@/components/sensitivity/SensitivityShelfAlert";
import { cn } from "@/lib/utils";

export interface ShelfProductCardProps {
  name: string;
  /** Brand line under the name. Accepts a node so <BrandLink /> can be passed. */
  brand?: ReactNode;
  description?: string | null;
  imageUrl?: string | null;
  storagePath?: string | null;
  /** 0–100 match score. Rendered as the gold pill on the right when present. */
  matchScore?: number | null;
  /** Status chips row (on shelf, in review, kind…). */
  chips?: ReactNode;
  /** Stars, note counts, sponsored line — sits under the brand line. */
  meta?: ReactNode;
  /** Full-width strip under the row (live offer banner). */
  banner?: ReactNode;
  /** Badge pinned over the top-left of the thumbnail (live offer flag). */
  thumbBadge?: ReactNode;
  /** Selection checkbox or similar, pinned left of the thumbnail. */
  leading?: ReactNode;
  /** Icon buttons top-right (favourite, reorder, expand). */
  headerActions?: ReactNode;
  /** Action row below a hairline. Clicks here never open the card. */
  footer?: ReactNode;
  /** Expanded region under the footer (voicenotes, rejection reason…). */
  children?: ReactNode;
  onOpen?: () => void;
  className?: string;
  /** Extra props for scroll restoration (`anchorProps(id)`). */
  anchor?: Record<string, unknown>;
  /**
   * Stored INCI list. When present, the card renders a red sensitivity strip
   * automatically (deterministic alias match, no AI, no network call).
   */
  ingredients?: string[] | null;
}

const ShelfProductCard = ({
  name,
  brand,
  description,
  imageUrl,
  storagePath,
  matchScore,
  chips,
  meta,
  banner,
  thumbBadge,
  leading,
  headerActions,
  footer,
  children,
  onOpen,
  className,
  anchor,
  ingredients,
}: ShelfProductCardProps) => {
  const openable = !!onOpen;
  // A declared sensitivity present in the formula caps the displayed score
  // instantly — no red warning may ever sit beside a comfortable percentage.
  const shownScore = useSensitivityAdjustedScore(matchScore, ingredients);
  return (
    <div
      {...anchor}
      className={cn(
        "bg-card border border-border rounded-[14px] overflow-hidden transition-colors",
        openable && "hover:border-primary/50",
        className,
      )}
    >
      <SensitivityShelfAlert ingredients={ingredients} />
      <div
        role={openable ? "button" : undefined}
        tabIndex={openable ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (!openable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen?.();
          }
        }}
        className={cn("p-3.5 flex items-start gap-3", openable && "cursor-pointer text-left")}
      >
        {leading}
        <div className="relative shrink-0">
          <ProductThumb
            imageUrl={imageUrl}
            storagePath={storagePath}
            alt={name}
            name={name}
            cover={!!storagePath}
            wrapperClassName="size-[66px] rounded-[10px] overflow-hidden bg-muted shrink-0"
          />
          {thumbBadge && (
            <div className="absolute -top-1.5 -left-1.5 z-10">{thumbBadge}</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display text-[15px] leading-tight line-clamp-2 [overflow-wrap:anywhere]">
            {name}
          </p>
          {brand && (
            <p className="text-[11px] text-muted-foreground font-body truncate mt-0.5">{brand}</p>
          )}
          {description && (
            <p className="mt-1 text-[12px] font-body text-foreground/75 leading-snug line-clamp-2 [overflow-wrap:anywhere]">
              {description}
            </p>
          )}
          {meta && <div className="mt-1 flex items-center gap-2 flex-wrap">{meta}</div>}
          {chips && <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">{chips}</div>}
        </div>
        {(shownScore != null || headerActions) && (
          <div className="shrink-0 flex flex-col items-end gap-1">
            {shownScore != null && (
              <span className="inline-flex items-center rounded-pill border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-[10.5px] font-semibold font-body text-primary">
                {shownScore}% match
              </span>
            )}
            {headerActions}
          </div>
        )}
      </div>

      {banner && (
        <div onClick={(e) => e.stopPropagation()} className="px-3.5 pb-3">
          {banner}
        </div>
      )}

      {footer && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-3.5 py-2.5 border-t border-border/60 flex items-center gap-2 flex-wrap"
        >
          {footer}
        </div>
      )}

      {children}
    </div>
  );
};

export default ShelfProductCard;
