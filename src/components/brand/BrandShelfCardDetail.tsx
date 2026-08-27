// The expanded region of a brand shelf card on the brand's public page.
//
// AI analysis is NOT generated here: it reuses the single existing
// product-analysis path (`brand-product-guidance`, via useBrandProductGuidance)
// that the banner drop-down and the offer product page already read, cached in
// `ai_summaries` under a profile-fingerprint key. Manuscript grounding and
// citation checks live in that function and are untouched.

import { useEffect } from "react";
import { Check, ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { useBrandProductGuidance } from "@/hooks/useBrandProductGuidance";
import { useLogAdEvent } from "@/hooks/useBrandOffers";
import type { ProductLiveOffer } from "@/hooks/useBrandProductEngagement";
import type { BrandShelfProduct } from "@/lib/addBrandProductToShelf";
import { hasFitContent, validFitLine } from "@/components/guidance/AdFitLine";

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

  const guidanceRead = guidance
    ? trimToSentences(
        [validFitLine(guidance.fit_line), guidance.intro].filter(Boolean).join(" "),
      )
    : null;
  const analysis = hasFitContent(guidanceRead) ? guidanceRead : null;

  const ingredients = (product.ingredients ?? []).filter(Boolean);
  const buyUrl = offer?.external_url ?? product.external_url ?? null;

  const benefits = (guidance?.benefits ?? []).filter((b) => b?.label && b?.text);
  const shortIngredients = ingredients.slice(0, 8);

  return (
    <div className="px-3.5 pb-3.5 pt-2 space-y-3.5 border-t border-border/60">
      {product.description && (
        <p className="border-l-2 border-primary/30 pl-2.5 text-[12px] font-body italic text-foreground/70 leading-snug [overflow-wrap:anywhere] whitespace-pre-wrap">
          {product.description}
        </p>
      )}

      {/* Personalised read — the hero of this block */}
      <div className="rounded-[14px] bg-primary/[0.06] border border-primary/20 p-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <p className="text-[10px] uppercase tracking-[0.16em] font-body text-primary">
            Why this suits you
          </p>
        </div>
        {loading && !analysis ? (
          <p className="mt-1.5 text-[12px] font-body text-muted-foreground">Reading your profile…</p>
        ) : analysis ? (
          <p className="mt-1.5 text-[12.5px] font-body text-foreground leading-relaxed [overflow-wrap:anywhere]">
            {analysis}
          </p>
        ) : (
          <p className="mt-1.5 text-[12px] font-body text-muted-foreground leading-snug">
            Open the product page for the full read.
          </p>
        )}

        {benefits.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 border-t border-primary/15 pt-2.5">
            {benefits.map((b) => (
              <li key={b.label} className="flex gap-2">
                <Check className="mt-[3px] size-3 shrink-0 text-primary" />
                <p className="text-[11.5px] font-body text-foreground/85 leading-snug [overflow-wrap:anywhere]">
                  <span className="font-display text-[12.5px] text-foreground">{b.label}</span>
                  {" — "}
                  {b.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ingredients.length > 0 && (
        <details className="group rounded-[14px] border border-border/60 bg-background/40 px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] font-body text-muted-foreground">
              Ingredients · {ingredients.length}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 hidden flex-wrap gap-1.5 group-open:flex">
            {ingredients.map((ing, i) => (
              <span
                key={`${ing}-${i}`}
                className="rounded-pill border border-border/70 bg-card px-2 py-[3px] text-[10.5px] font-body text-foreground/75 [overflow-wrap:anywhere]"
              >
                {ing}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-body text-muted-foreground leading-snug [overflow-wrap:anywhere] group-open:hidden">
            {shortIngredients.join(", ")}
            {ingredients.length > shortIngredients.length ? "…" : ""}
          </p>
        </details>
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
