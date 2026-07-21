import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, Heart, Sparkles, Loader2 } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { buildAiContext } from "@/lib/aiContext";

const OfferPage = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const slot = (params.get("slot") as PlacementSlot | null) ?? null;
  const nav = useNavigate();
  const { user } = useAuth();
  const logStat = useLogBrandStat();
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, { verdict: string; body: string }>>({});

  const { data: offer, isLoading } = useQuery({
    queryKey: ["brand-offer-public", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("id, headline, body_copy, hero_image_path, external_url, discount_code, status, brand_user_id, brand_products(*)")
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

  const goOffer = (url: string, productName?: string) => {
    logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const addToWishlist = async (productName: string) => {
    if (!user) return;
    try {
      await supabase.from("user_products").insert({
        user_id: user.id,
        name: productName,
        list: "wishlist" as never,
      } as never);
      logStat.mutate({ offer_id: offer.id, slot, kind: "wishlist_adds" });
      toast.success("Added to wishlist");
    } catch (e) {
      toast.error("Couldn't add to wishlist");
    }
  };

  const analyseFit = async (productId: string, product: { name: string; ingredients: string[] | null }) => {
    if (!user) return;
    setAnalysingId(productId);
    try {
      const ctx = await buildAiContext(user.id);
      const { data, error } = await supabase.functions.invoke("ingredient-analysis", {
        body: {
          productName: product.name,
          ingredients: product.ingredients ?? [],
          context: ctx,
        },
      });
      if (error) throw error;
      setAnalysis((prev) => ({
        ...prev,
        [productId]: {
          verdict: data?.verdict ?? "Review below",
          body: data?.summary ?? data?.body ?? "See full ingredient breakdown.",
        },
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysingId(null);
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
            {(offer.brand_products ?? []).map((p) => (
              <SurfaceCard key={p.id} className="space-y-2.5">
                <div>
                  <p className="font-display text-[15px] leading-tight">{p.name}</p>
                  {p.description && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{p.description}</p>}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {p.external_url && (
                    <Button variant="gold" size="pill" onClick={() => goOffer(p.external_url!, p.name)} className="text-[11px] px-2">
                      Get offer
                    </Button>
                  )}
                  <Button variant="outline" size="pill" onClick={() => addToWishlist(p.name)} className="text-[11px] px-2">
                    <Heart className="size-3.5 mr-1" /> Wishlist
                  </Button>
                  <Button
                    variant="outline"
                    size="pill"
                    onClick={() => analyseFit(p.id, { name: p.name, ingredients: p.ingredients })}
                    disabled={analysingId === p.id}
                    className="text-[11px] px-2"
                  >
                    {analysingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <><Sparkles className="size-3.5 mr-1" /> For me?</>}
                  </Button>
                </div>
                {analysis[p.id] && (
                  <div className="rounded-lg bg-muted/60 p-2.5 text-[12px] leading-snug">
                    <p className="font-body font-medium text-foreground">{analysis[p.id].verdict}</p>
                    <p className="text-muted-foreground mt-1">{analysis[p.id].body}</p>
                  </div>
                )}
              </SurfaceCard>
            ))}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default OfferPage;
