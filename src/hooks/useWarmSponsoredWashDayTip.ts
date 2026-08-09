// PRE-WARM THE SPONSORED WASH DAY TIP
// ===================================
// The sponsored wash day tip is grounded generation (manuscript retrieval plus
// two model stages) and takes tens of seconds when it has to be produced on
// demand. Approval-time pre-generation covers the audience matched at that
// moment, but a member who becomes eligible later — new consent, changed hair
// data, a fresh profile — still hit the slow path on the Wash Day screen.
//
// So we start that work from an earlier screen (the home page). By the time the
// member taps through to Wash Day the tip is already in `ai_summaries` and the
// card renders from a single indexed read.
//
// Nothing is rendered and no ad event is logged here: this only resolves which
// campaign is live for the wash day slot and asks for its guidance in the
// background.

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveBrandOffer } from "@/hooks/useBrandOffers";
import { usePersonalisedOffersConsent } from "@/hooks/useAdTargeting";
import { warmBrandProductGuidance } from "@/hooks/useBrandProductGuidance";

export function useWarmSponsoredWashDayTip() {
  const { user } = useAuth();
  const { data: consented } = usePersonalisedOffersConsent();
  const { data: delivery } = useActiveBrandOffer("wash_day", { enabled: !!consented });
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !consented) return;
    const offer = delivery?.brand_offers as
      | {
          brand_user_id?: string | null;
          brand_products?: Array<Record<string, unknown>> | null;
        }
      | undefined;
    const product = offer?.brand_products?.[0] as
      | {
          id: string;
          name: string;
          description?: string | null;
          kind?: string | null;
          tool_kind?: string | null;
          external_url?: string | null;
          ingredients?: string[] | null;
          key_features?: string[] | null;
          materials?: string[] | null;
        }
      | undefined;
    if (!product?.id) return;
    const key = `${user.id}:${product.id}`;
    if (done.current === key) return;
    done.current = key;
    warmBrandProductGuidance(user.id, { ...product, ingredients: product.ingredients ?? [] }, "wash_day");
  }, [user?.id, consented, delivery]);
}
