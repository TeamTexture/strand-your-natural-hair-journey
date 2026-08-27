import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Plus, Check, Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useLogAdEvent } from "@/hooks/useBrandOffers";
import { useBrandProductGuidance } from "@/hooks/useBrandProductGuidance";
import AdFitLine from "@/components/guidance/AdFitLine";
import type { BannerProductRow } from "@/components/brand/BrandOfferBanner";

interface Props {
  offerId: string;
  slot: string;
  product: BannerProductRow;
  brandName?: string | null;
  /** Drives tab order and whether the guidance request is allowed to run. */
  expanded: boolean;
}

/** ONE PRODUCT BLOCK inside the single advert renderer.
 *
 *  An advert may promote one or two products (never more). The offer-level
 *  furniture — hero, headline, discount code, "Visit offer", the SPONSORED
 *  disclosure — renders ONCE in BrandOfferBanner. This block is the only part
 *  that repeats, and it carries its OWN personalised tip so a member with two
 *  products in front of them can tell which product each tip describes.
 *
 *  The tip is `fit_line` from `brand-product-guidance`: an action sentence plus
 *  a reason sentence, grounded in the manuscript with citation checks, and
 *  cached per member per product id — so two blocks are two cache entries, no
 *  new caching needed. The brand supplies product facts only and can never
 *  write or edit a tip. */
const BannerProductBlock = ({ offerId, slot, product, brandName = null, expanded }: Props) => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { allProducts, upsert } = useUserProducts();
  const logEvent = useLogAdEvent();
  const [shelfBusy, setShelfBusy] = useState(false);

  // Generated on expand (a deliberate action), never on a passing impression.
  // Generated on expand (a deliberate action), never on a passing impression.
  // `needsFallback` means the spinner has stopped with no personalised line
  // (timeout, guardrail rejection or a service error) — an advert must still
  // carry usage copy, so the brand's own declared line is shown instead.
  const { guidance, loading, needsFallback } = useBrandProductGuidance(product, {
    enabled: expanded,
  });
  const fitLine = guidance?.fit_line ?? (needsFallback ? adFallbackFitLine(product) : undefined);


  const imageUrl = product.image_urls?.[0] ?? null;

  const openProduct = (e: React.MouseEvent) => {
    e.stopPropagation();
    logEvent.mutate({ offer_id: offerId, slot, event_type: "expand" });
    nav(`/offers/${offerId}/product/${product.id}?slot=${slot}`);
  };

  const shelfRow = useMemo(
    () =>
      allProducts.find(
        (row) =>
          row.linked_brand_product_id === product.id ||
          row.product_key === `brand-offer:${product.id}` ||
          (row.name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
            (row.brand ?? "").trim().toLowerCase() === (brandName ?? "").trim().toLowerCase()),
      ) ?? null,
    [allProducts, product, brandName],
  );
  const onShelf = !!shelfRow?.on_shelf;

  const addToShelf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setShelfBusy(true);
    try {
      const row = await upsert({
        product_key: shelfRow?.product_key ?? `brand-offer:${product.id}`,
        name: product.name,
        brand: brandName,
        ingredients: (product.ingredients ?? []) as string[],
        image_url: imageUrl,
        linked_brand_offer_id: offerId,
        linked_brand_product_id: product.id,
        on_shelf: true,
        on_wishlist: false,
      });
      if (!row) throw new Error("Could not add to your shelf");
      logEvent.mutate({ offer_id: offerId, brand_product_id: product.id, slot, event_type: "shelf_add" });
      toast.success("Added to your shelf");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add to your shelf");
    } finally {
      setShelfBusy(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-border bg-background/60 p-3.5 min-w-0">
      <button
        type="button"
        tabIndex={expanded ? 0 : -1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={openProduct}
        className="w-full text-left flex items-start gap-3 min-w-0"
      >
        <div className="size-[72px] shrink-0 rounded-[10px] overflow-hidden bg-muted border border-border">
          {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          {/* Full product name — wraps, never ellipsis-truncated. */}
          <p className="font-display text-[13.5px] leading-snug [overflow-wrap:anywhere]">
            {product.name}
          </p>
          {brandName && (
            <p className="mt-1 text-[11px] font-body text-muted-foreground leading-tight [overflow-wrap:anywhere]">
              {brandName}
            </p>
          )}
        </div>
      </button>

      {/* THIS product's tip — inside the block, so it is never ambiguous which
       *  of two products it describes. */}
      <AdFitLine text={guidance?.fit_line} loading={loading} className="mt-3" />

      <div className="mt-3 -mb-1 flex items-center gap-2 border-t border-border pt-2.5">
        <button
          type="button"
          tabIndex={expanded ? 0 : -1}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={openProduct}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
        >
          <span className="text-[12px] font-body text-foreground/90">How to use it for your hair</span>
          <ChevronRight className="size-4 text-primary shrink-0" />
        </button>
        {/* Per-product add-to-shelf. The only add-to-shelf in an advert — never
         *  duplicated in the sponsored wash day tip above. */}
        <button
          type="button"
          tabIndex={expanded ? 0 : -1}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={addToShelf}
          disabled={shelfBusy || onShelf}
          aria-label={onShelf ? `${product.name} is on your shelf` : `Add ${product.name} to my shelf`}
          className="shrink-0 inline-flex items-center gap-1 rounded-pill border border-primary/40 px-2.5 py-1 text-[11px] font-body font-semibold text-primary disabled:opacity-60"
        >
          {shelfBusy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : onShelf ? (
            <Check className="size-3" />
          ) : (
            <Plus className="size-3" />
          )}
          {onShelf ? "On shelf" : "Add"}
        </button>
      </div>
    </div>
  );
};

export default BannerProductBlock;
