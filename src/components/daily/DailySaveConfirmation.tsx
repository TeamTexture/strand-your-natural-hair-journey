// LAYER 1 — the instant confirmation after a daily log save.
//
// NO MODEL CALL. Everything here is already on file: the product row (thumbnail,
// name, its stored match rating) and its stored analysis drivers, turned into
// prose by `buildSaveGuidance`. If a product has never been analysed, the
// guidance block is simply absent — nothing is invented to fill the space.

import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import ProductThumb from "@/components/ProductThumb";
import MatchStars from "@/components/MatchStars";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";
import { buildSaveGuidance } from "@/lib/dailyLogGuidance";
import type { HairCharacteristics } from "@/lib/dailyLogGuidance";
import type { UserProduct } from "@/hooks/useUserProducts";

const prettyTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
};

const LoggedProductCard = ({
  product,
  loggedAt,
  hair,
}: {
  product: UserProduct;
  loggedAt: string;
  hair: HairCharacteristics | null;
}) => {
  const guidance = buildSaveGuidance(
    product as unknown as Parameters<typeof buildSaveGuidance>[0],
    hair,
  );
  const time = prettyTime(loggedAt);

  return (
    <SurfaceCard className="space-y-3">
      <div className="flex items-start gap-3">
        <ProductThumb
          imageUrl={product.image_url}
          storagePath={product.storage_path}
          alt={product.name}
          cover
          wrapperClassName="size-[46px] rounded-[8px] overflow-hidden bg-secondary shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="product-title text-[13.5px] leading-snug break-words [overflow-wrap:anywhere]">
            {product.name}
          </p>
          {product.brand && (
            <p className="font-body text-[11.5px] text-muted-foreground break-words [overflow-wrap:anywhere]">
              {product.brand}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <MatchStars item={product} ingredients={product.ingredients} />
            {time && (
              <span className="font-body text-[11px] text-muted-foreground">
                Logged {time}
              </span>
            )}
          </div>
        </div>
      </div>

      {guidance && (
        <div className="rounded-[10px] bg-secondary p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
            Why this works for you
          </p>
          <div className="mt-1.5 font-body text-[12.5px] leading-relaxed text-foreground/90">
            <GlossaryRichText text={guidance.text} />
          </div>
        </div>
      )}

      <Link
        to={`/products/profile/${product.id}`}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-medium text-primary"
      >
        See full breakdown
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </SurfaceCard>
  );
};

/**
 * Shown in place of the form once the entry is saved. One card per product she
 * logged, then the way onward. She is never left wondering whether it saved.
 */
const DailySaveConfirmation = ({
  products,
  loggedAt,
  hair,
}: {
  products: UserProduct[];
  loggedAt: string;
  hair: HairCharacteristics | null;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <span className="size-6 rounded-full bg-primary flex items-center justify-center shrink-0">
        <Check className="size-3.5 text-primary-foreground" aria-hidden />
      </span>
      <p className="font-body text-[12.5px] text-foreground/80">
        Saved to your hair history.
      </p>
    </div>

    {products.map((p) => (
      <LoggedProductCard key={p.id} product={p} loggedAt={loggedAt} hair={hair} />
    ))}
  </div>
);

export default DailySaveConfirmation;
