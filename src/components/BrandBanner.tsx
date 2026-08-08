import { useActiveBrandOffer, PlacementSlot } from "@/hooks/useBrandOffers";
import BrandOfferBanner, { BannerOffer } from "@/components/brand/BrandOfferBanner";

interface Props {
  slot: PlacementSlot;
  /** Adds a worded open control ("See full offer") to the collapsed strip.
   *  Used on wash day, where the advert sits under the sponsored tip. Omitted
   *  on the home page, which keeps its existing chevron-only strip. */
  collapsedCta?: string | null;
}

// Sponsored banners cannot be permanently dismissed — users can only collapse
// them via the chevron. If they collapse or leave one, the same advert is
// reachable again from the brand's page in the directory.

/** Resolves which paid campaign holds this slot today (server-side, via
 *  `ad_delivery_for_slot`) and renders the shared advert card. Silent when no
 *  offer holds the slot. */
const BrandBanner = ({ slot, collapsedCta = null }: Props) => {
  const { data } = useActiveBrandOffer(slot);
  const offer = data?.brand_offers as BannerOffer | undefined;
  if (!offer) return null;

  return (
    <BrandOfferBanner
      offer={offer}
      slot={slot}
      wasMatched={!!data?.was_matched}
      matchReason={data?.match_reason ?? null}
      collapsedCta={collapsedCta}
    />
  );
};


export default BrandBanner;
