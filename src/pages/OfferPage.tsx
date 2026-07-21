import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, Heart, Sparkles, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLogBrandStat, PlacementSlot } from "@/hooks/useBrandOffers";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useQuery } from "@tanstack/react-query";

/** Deterministic product_key so a brand product only ever creates a single
 *  user_products row per user — matches how manually-scanned products dedupe. */
const productKeyFor = (brandProductId: string) => `brand-offer:${brandProductId}`;

const OfferPage = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const slot = (params.get("slot") as PlacementSlot | null) ?? null;
  const nav = useNavigate();
  const { user } = useAuth();
  const logStat = useLogBrandStat();
  const { allProducts, upsert } = useUserProducts();
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: offer, isLoading } = useQuery({
    queryKey: ["brand-offer-public", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("id, headline, body_copy, hero_image_path, external_url, discount_code, status, ends_on, brand_user_id, brand_products(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (offer?.hero_image_path) {
      supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60).then(({ data }) => {
        setHeroUrl(data?.signedUrl ?? null);
      });
    }
  }, [offer?.hero_image_path]);

  if (isLoading || !offer) return <LoadingDot />;

  const goOffer = (url: string) => {
    logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const findExisting = (bp: { id: string; name: string; brand_name?: string | null }) =>
    allProducts.find(
      (row) =>
        row.product_key === productKeyFor(bp.id) ||
        row.linked_brand_product_id === bp.id ||
        (row.name.trim().toLowerCase() === bp.name.trim().toLowerCase() &&
          (row.brand ?? "").trim().toLowerCase() ===
            (bp.brand_name ?? "").trim().toLowerCase()),
    );

  /** Upserts the brand product into the user's shelf/wishlist system and
   *  preserves the sponsored context. Deduped by product_key first, then by
   *  name+brand to avoid orphan duplicates for products already in the app. */
  const upsertBrandProduct = async (
    bp: { id: string; name: string; brand_name: string | null; ingredients: string[] | null; image_url: string | null; external_url: string | null },
    opts: { wishlist: boolean },
  ): Promise<UserProduct | null> => {
    const existing = findExisting(bp);
    const payload: Partial<UserProduct> & { product_key: string; name: string } = {
      product_key: existing?.product_key ?? productKeyFor(bp.id),
      name: bp.name,
      brand: bp.brand_name,
      ingredients: bp.ingredients ?? existing?.ingredients ?? [],
      image_url: bp.image_url ?? existing?.image_url ?? null,
      linked_brand_offer_id: offer.id,
      linked_brand_product_id: bp.id,
    };
    if (opts.wishlist) {
      payload.on_wishlist = true;
    }
    return upsert(payload);
  };

  const addToWishlist = async (bp: {
    id: string; name: string; brand_name: string | null; ingredients: string[] | null; image_url: string | null; external_url: string | null;
  }) => {
    if (!user) return;
    setBusyId(bp.id);
    try {
      const row = await upsertBrandProduct(bp, { wishlist: true });
      if (row) {
        logStat.mutate({ offer_id: offer.id, slot, kind: "wishlist_adds" });
        toast.success("Added to your wishlist");
      }
    } finally {
      setBusyId(null);
    }
  };

  /** Native AI analysis: mirror the existing ingredient-analysis UX by
   *  upserting the product and jumping into the standard product profile
   *  page, which already renders personalised suitability the exact way
   *  users know from their shelf. */
  const analyseForMe = async (bp: {
    id: string; name: string; brand_name: string | null; ingredients: string[] | null; image_url: string | null; external_url: string | null;
  }) => {
    if (!user) return;
    setBusyId(bp.id);
    try {
      const row = await upsertBrandProduct(bp, { wishlist: false });
      if (row) nav(`/products/profile/${row.id}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Offer" onBack={() => nav(-1)} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard padded={false} className="overflow-hidden">
          {heroUrl && <img src={heroUrl} alt="" className="w-full aspect-[16/9] object-cover" />}
          <div className="p-4">
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-body">Sponsored</p>
            <p className="font-display text-xl mt-1">{offer.headline}</p>
            {offer.body_copy && <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{offer.body_copy}</p>}
            {offer.discount_code && (
              <div className="mt-3 p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Discount code</p>
                <p className="font-display text-lg text-primary tracking-widest mt-0.5">{offer.discount_code}</p>
              </div>
            )}
            {offer.external_url && (
              <Button variant="gold" size="pill" onClick={() => goOffer(offer.external_url!)} className="w-full mt-3">
                <ExternalLink className="size-4 mr-1.5" /> Get this offer
              </Button>
            )}
          </div>
        </SurfaceCard>

        {(offer.brand_products ?? []).length > 0 && (
          <>
            <SectionLabel className="!px-0">Products in this offer</SectionLabel>
            {(offer.brand_products ?? []).map((p) => {
              const existing = findExisting(p);
              const alreadyWishlisted = !!existing?.on_wishlist;
              return (
                <SurfaceCard key={p.id} className="space-y-2.5">
                  <div>
                    <p className="font-display text-[15px] leading-tight">{p.name}</p>
                    {p.description && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{p.description}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {p.external_url && (
                      <Button variant="gold" size="pill" onClick={() => goOffer(p.external_url!)} className="text-[11px] px-2">
                        Get offer
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="pill"
                      onClick={() => addToWishlist(p)}
                      disabled={busyId === p.id || alreadyWishlisted}
                      className="text-[11px] px-2"
                    >
                      {alreadyWishlisted ? (
                        <><Check className="size-3.5 mr-1" /> On list</>
                      ) : (
                        <><Heart className="size-3.5 mr-1" /> Wishlist</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="pill"
                      onClick={() => analyseForMe(p)}
                      disabled={busyId === p.id}
                      className="text-[11px] px-2"
                    >
                      {busyId === p.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <><Sparkles className="size-3.5 mr-1" /> For me?</>}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    "For me?" opens the full personalised ingredient analysis you already use for your shelf.
                  </p>
                </SurfaceCard>
              );
            })}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default OfferPage;
