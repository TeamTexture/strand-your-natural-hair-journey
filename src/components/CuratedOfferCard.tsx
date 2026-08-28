import { ExternalLink, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { useCuratedOfferImage, type CuratedOffer } from "@/hooks/useCuratedOffers";

/** Friendly "ends 3 September" for the member, never a raw date string. */
function endsLabel(endsOn: string | null): string | null {
  if (!endsOn) return null;
  const d = new Date(`${endsOn}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `Ends ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
}

/** A STRAND-curated partner deal. Visually matches the other offer cards on the
 *  Discounts page but carries no sponsored label and no ad tracking. */
const CuratedOfferCard = ({ offer }: { offer: CuratedOffer }) => {
  const { data: imageUrl } = useCuratedOfferImage(offer.image_path);
  const ends = endsLabel(offer.ends_on);

  return (
    <div className="rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${offer.brand_name} offer`}
          loading="lazy"
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-11 rounded-[13px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Tag className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] leading-tight">{offer.brand_name}</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
              {offer.title}
            </p>
          </div>
        </div>

        {offer.description && (
          <p className="text-[12.5px] leading-snug font-body text-foreground/85 whitespace-pre-line">
            {offer.description}
          </p>
        )}

        {offer.discount_code ? (
          <DiscountCodeChip code={offer.discount_code} variant="block" />
        ) : null}

        {offer.external_url ? (
          <Button
            variant="gold"
            size="pill"
            className="w-full gap-1.5"
            onClick={() => window.open(offer.external_url!, "_blank", "noopener,noreferrer")}
          >
            Shop the offer <ExternalLink className="size-3.5" />
          </Button>
        ) : null}

        {ends && (
          <p className="text-[10.5px] font-body text-muted-foreground text-center">{ends}</p>
        )}
      </div>
    </div>
  );
};

export default CuratedOfferCard;
