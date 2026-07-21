import { ChevronDown } from "lucide-react";

interface Props {
  heroUrl: string | null;
  headline: string;
  bodyCopy: string;
  discountCode: string;
  productName?: string | null;
  productImageUrl?: string | null;
  expanded?: boolean;
}

/** Live preview of a brand banner at true mobile proportions (375px shell).
 *  Renders both collapsed (~80px strip) and expanded (drop-down with product
 *  card) states so brands see exactly what STRAND members will see. */
const BannerPreview = ({
  heroUrl,
  headline,
  bodyCopy,
  discountCode,
  productName,
  productImageUrl,
  expanded = false,
}: Props) => {
  return (
    <div className="w-full max-w-[343px] mx-auto">
      {/* Collapsed strip — full-width, ~80px tall, brand image as backdrop. */}
      <div className="relative rounded-t-[14px] overflow-hidden border border-primary/20 bg-card" style={{ height: 80 }}>
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        <span className="absolute top-1.5 left-2 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
          Sponsored
        </span>
        <div className="relative h-full flex items-center pl-3 pr-9 w-2/3">
          <p className="font-display text-white text-[15px] leading-tight line-clamp-2 drop-shadow-sm">
            {headline || "Your headline goes here"}
          </p>
        </div>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-white/85" />
      </div>

      {expanded && (
        <div className="rounded-b-[14px] border border-t-0 border-primary/20 bg-card p-3">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              {bodyCopy ? (
                <p className="text-[12px] text-foreground/80 leading-snug font-body">{bodyCopy}</p>
              ) : (
                <p className="text-[12px] text-muted-foreground italic font-body">Body copy shows here.</p>
              )}
              {discountCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/30 px-2 py-1">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-body">Code</span>
                  <span className="font-body font-medium text-[12px] text-primary">{discountCode}</span>
                </div>
              )}
              <button
                type="button"
                className="mt-2.5 w-full rounded-pill bg-primary text-primary-foreground text-[12px] font-body font-medium py-1.5 pointer-events-none"
              >
                Visit offer
              </button>
            </div>
            {(productImageUrl || productName) && (
              <div className="w-[92px] shrink-0">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                  {productImageUrl && (
                    <img src={productImageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                {productName && (
                  <p className="mt-1 text-[10px] font-body leading-tight line-clamp-2">{productName}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BannerPreview;
