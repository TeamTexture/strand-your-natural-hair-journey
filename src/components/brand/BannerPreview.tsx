import { ChevronDown } from "lucide-react";

interface Props {
  heroUrl: string | null;
  headline: string;
  bodyCopy: string;
  discountCode: string;
  productName?: string | null;
  productImageUrl?: string | null;
  expanded?: boolean;
  showSafeArea?: boolean;
}

/** Live preview of a brand banner at true mobile proportions (375px shell).
 *  Renders both collapsed (~80px strip) and expanded (drop-down with product
 *  card) states so brands see exactly what STRAND members will see.
 *  When headline is empty, renders image-only (no scrim/text overlay).
 *  When showSafeArea, overlays a dashed guide marking the "keep text & logos
 *  inside" zone (6% margin) so brands don't push copy to the bleed edge. */
const BannerPreview = ({
  heroUrl,
  headline,
  bodyCopy,
  discountCode,
  productName,
  productImageUrl,
  expanded = false,
  showSafeArea = false,
}: Props) => {
  const hasHeadline = Boolean(headline && headline.trim());
  return (
    <div className="w-full min-w-0 max-w-full mx-auto overflow-hidden">
      {/* Collapsed strip — full-width, ~80px tall, brand image as backdrop. */}
      <div className="relative rounded-t-[12px] overflow-hidden border border-primary/20 bg-card" style={{ height: 80 }}>
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        {hasHeadline && (
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        )}
        <span className="absolute top-1.5 left-2 text-[8px] uppercase tracking-wider bg-background/85 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground font-body">
          Sponsored
        </span>
        {hasHeadline && (
          <div className="relative h-full flex items-center pl-3 pr-9 max-w-[68%]">
            <p className="font-display text-white text-[15px] leading-tight line-clamp-2 drop-shadow-sm break-words">
              {headline}
            </p>
          </div>
        )}
        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 size-4 ${hasHeadline || heroUrl ? "text-white/85 drop-shadow" : "text-muted-foreground"}`} />
        {showSafeArea && (
          <>
            {/* Bleed edge — outer 6% is at risk of being cropped on some devices */}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-red-500/60 ring-inset" />
            {/* Safe zone — keep headline, logos & key product imagery INSIDE this */}
            <div
              className="pointer-events-none absolute border border-dashed border-emerald-400"
              style={{ top: "10%", bottom: "10%", left: "4%", right: "4%" }}
            />
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 translate-y-[9%] text-[8px] uppercase tracking-wider font-body px-1 rounded bg-emerald-500/90 text-white">
              Safe zone
            </span>
          </>
        )}
      </div>



      {expanded && (
        <div className="rounded-b-[12px] border border-t-0 border-primary/20 bg-card p-3 overflow-hidden">
          <div className="flex gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              {bodyCopy ? (
                <p className="text-[12px] text-foreground/80 leading-snug font-body">{bodyCopy}</p>
              ) : (
                <p className="text-[12px] text-muted-foreground italic font-body">Body copy shows here.</p>
              )}
              {discountCode && (
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/10 border border-primary/30 px-2 py-1">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-body">Code</span>
                  <span className="font-body font-medium text-[12px] text-primary truncate">{discountCode}</span>
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
              <div className="w-[82px] shrink-0">
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
