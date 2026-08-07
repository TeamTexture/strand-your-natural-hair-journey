// The expanded region of a brand shelf card on the brand's public page.
//
// AI analysis is NOT generated here: it reuses the single existing
// product-analysis path (`brand-product-guidance`, via useBrandProductGuidance)
// that the banner drop-down and the offer product page already read, cached in
// `ai_summaries` under a profile-fingerprint key. Manuscript grounding and
// citation checks live in that function and are untouched.

import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { useBrandProductGuidance } from "@/hooks/useBrandProductGuidance";
import { useLogAdEvent } from "@/hooks/useBrandOffers";
import type { ProductLiveOffer } from "@/hooks/useBrandProductEngagement";
import type { BrandShelfProduct } from "@/lib/addBrandProductToShelf";

/** Two or three sentences, never a paragraph. */
const trimToSentences = (text: string, max = 3) => {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]?/g) ?? [];
  return parts.slice(0, max).join(" ").trim();
};

const BrandShelfCardDetail = ({
  product,
  brandName,
  offer,
  onOpenDetail,
}: {
  product: BrandShelfProduct;
  brandName: string | null;
  offer?: ProductLiveOffer;
  onOpenDetail: () => void;
}) => {
  const log = useLogAdEvent();
  const { guidance, loading } = useBrandProductGuidance(
    {
      id: product.id,
      name: product.name,
      brand: brandName,
      description: product.description,
      kind: product.kind,
      tool_kind: product.tool_kind ?? null,
      external_url: product.external_url ?? null,
      ingredients: product.ingredients ?? [],
      key_features: product.key_features ?? [],
      materials: product.materials ?? [],
    },
    { enabled: true },
  );

  // One expand event per mount of the expanded region.
  useEffect(() => {
    log.mutate({
      brand_product_id: product.id,
      offer_id: offer?.offer_id ?? null,
      slot: "brand_shelf",
      event_type: "expand",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const analysis = guidance
    ? trimToSentences([guidance.fit_line, guidance.intro].filter(Boolean).join(" "))
    : null;

  const ingredients = (product.ingredients ?? []).filter(Boolean);
  const buyUrl = offer?.external_url ?? product.external_url ?? null;

  return (
    <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-border/60">
      {product.description && (
        <p className="text-[12px] font-body text-foreground/80 leading-snug [overflow-wrap:anywhere] whitespace-pre-wrap">
          {product.description}
        </p>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] font-body text-muted-foreground">
          For your hair
        </p>
        {loading && !analysis ? (
          <p className="mt-1 text-[12px] font-body text-muted-foreground">Reading your profile…</p>
        ) : analysis ? (
          <p className="mt-1 text-[12px] font-body text-foreground/85 leading-snug [overflow-wrap:anywhere]">
            {analysis}
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-body text-muted-foreground leading-snug">
            Open the product page for the full read.
          </p>
        )}
      </div>

      {ingredients.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-body text-muted-foreground">
            Ingredients
          </p>
          <p className="mt-1 text-[11.5px] font-body text-foreground/75 leading-snug [overflow-wrap:anywhere]">
            {ingredients.join(", ")}
          </p>
        </div>
      )}

      {offer?.discount_code && (
        <div className="rounded-[12px] border border-primary/25 bg-primary/5 p-2.5 space-y-2">
          <DiscountCodeChip
            code={offer.discount_code}
            variant="block"
            label="Discount code"
            onCopy={() =>
              log.mutate({
                offer_id: offer.offer_id,
                brand_product_id: product.id,
                slot: "brand_shelf",
                event_type: "code_copy",
              })
            }
          />
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                log.mutate({
                  offer_id: offer.offer_id,
                  brand_product_id: product.id,
                  slot: "brand_shelf",
                  event_type: "link_click",
                })
              }
              className="inline-flex items-center gap-1 text-[12px] font-body text-primary"
            >
              Use it at {brandName ?? "the brand"} <ExternalLink className="size-3 opacity-60" />
            </a>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpenDetail}
        className="text-[12px] font-body text-primary underline underline-offset-2"
      >
        See the full product page
      </button>
    </div>
  );
};

export default BrandShelfCardDetail;
