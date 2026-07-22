import { smartBack } from "@/lib/smartBack";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Zap, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBrandOffer } from "@/hooks/useBrandOffers";
import CountdownClock from "@/components/brand/CountdownClock";
import { getOfferExpiry, buildCountdown, formatCountdown } from "@/lib/offerExpiry";
import { useOwnerMode, ownerOfferRoute } from "@/hooks/useOwnerMode";

/**
 * Extend an existing offer.
 *
 * MVP flow: clone the creative + attached products into a brand-new draft
 * offer with no placements, then send the brand into the standard offer
 * editor to pick fresh dates and submit for review + payment. This keeps
 * the current offer running untouched and avoids a bespoke top-up payment
 * path — the same review/approve/pay pipeline handles it.
 */
const BrandExtendOffer = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const ownerMode = useOwnerMode();
  const { data: offer, isLoading } = useBrandOffer(id);
  const [cloning, setCloning] = useState(false);


  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setTick(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (isLoading || !offer) return <LoadingDot />;

  const expiry = getOfferExpiry(offer);
  const countdown = buildCountdown(expiry, tick);

  const cloneAndEdit = async () => {
    if (!user) return;
    setCloning(true);
    try {
      const payload = {
        brand_user_id: user.id,
        owner_type: ownerMode,
        headline: offer.headline,
        body_copy: offer.body_copy,
        discount_code: offer.discount_code,
        external_url: offer.external_url,
        hero_image_path: offer.hero_image_path,
        status: "draft" as const,
        total_price_pence: 0,
        starts_on: null as string | null,
        ends_on: null as string | null,
      };
      const { data: created, error } = await supabase
        .from("brand_offers")
        .insert(payload as unknown as never)
        .select("id")
        .single();
      if (error) throw error;
      const newId = created.id;

      const products = offer.brand_products ?? [];
      if (products.length > 0) {
        const rows = products.map((p, i) => {
          const row = p as typeof p & {
            kind?: string; tool_kind?: string | null;
            key_features?: string[] | null; materials?: string[] | null;
          };
          return {
            offer_id: newId,
            name: p.name,
            description: p.description ?? null,
            external_url: p.external_url ?? null,
            image_urls: p.image_urls ?? [],
            ingredients: p.ingredients ?? [],
            kind: row.kind ?? "product",
            tool_kind: row.tool_kind ?? null,
            key_features: row.key_features ?? [],
            materials: row.materials ?? [],
            source_type: p.source_type ?? "manual",
            source_url: p.source_url ?? null,
            linked_product_id: p.linked_product_id ?? null,
            position: i,
          };
        });
        const { error: pErr } = await supabase
          .from("brand_products")
          .insert(rows as unknown as never);
        if (pErr) throw pErr;
      }

      toast.success("Extension draft created — pick new dates");
      nav(`${ownerOfferRoute(ownerMode, newId)}/edit`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extend failed");
      setCloning(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Extend offer" onBack={smartBack(nav, ownerOfferRoute(ownerMode, id!))} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="space-y-2">
          <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium">Current offer</p>
          <p className="font-display text-[16px] leading-tight">{offer.headline ?? "Untitled offer"}</p>
          {countdown && (
            <p className="text-[12px] font-body">
              <span className="text-muted-foreground">Ends in </span>
              <span className={countdown.soon ? "text-destructive font-medium" : "text-foreground font-medium"}>
                {formatCountdown(countdown)}
              </span>
            </p>
          )}
          <div className="pt-1">
            <CountdownClock offer={offer} variant="block" />
          </div>
        </SurfaceCard>

        <SurfaceCard className="space-y-2">
          <div className="flex items-start gap-2.5">
            <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Zap className="size-4" />
            </div>
            <div className="flex-1">
              <p className="font-display text-[14.5px] leading-tight">Keep the momentum going</p>
              <p className="text-[11.5px] text-foreground/80 font-body leading-snug mt-1">
                We'll copy this offer's banner, headline, discount code and attached products into a new draft.
                You just pick new placement dates, we send it for quick admin review, and you complete payment for
                the added days. Your current banner keeps running until it ends — no gap.
              </p>
            </div>
          </div>
          <ul className="text-[11.5px] font-body text-foreground/80 pl-11 space-y-0.5 leading-snug">
            <li>· Same creative — no re-upload.</li>
            <li>· You choose how many extra days.</li>
            <li>· Charged only for the new days at current placement rates.</li>
          </ul>
        </SurfaceCard>

        <Button variant="gold" size="pill" onClick={cloneAndEdit} disabled={cloning} className="w-full">
          {cloning ? <Loader2 className="size-4 animate-spin" /> : <><CalendarPlus className="size-4 mr-1.5" /> Pick new dates</>}
        </Button>
        <Button variant="outline" size="pill" onClick={() => nav(ownerOfferRoute(ownerMode, id!))} className="w-full">
          Not now
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BrandExtendOffer;
