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
import DiscountCodeChip from "@/components/DiscountCodeChip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLogBrandStat, PlacementSlot } from "@/hooks/useBrandOffers";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useUserTools } from "@/hooks/useUserTools";
import { useQuery } from "@tanstack/react-query";
import { buildAiContext } from "@/lib/aiContext";
import { ToolAdviceDialog } from "@/components/ToolAdviceDialog";

/** Deterministic keys so a brand item only ever creates a single row per user. */
const productKeyFor = (brandProductId: string) => `brand-offer:${brandProductId}`;
const toolKeyFor = (brandProductId: string) => `brand-offer-tool:${brandProductId}`;

type BrandItemRow = {
  id: string;
  name: string;
  description: string | null;
  ingredients: string[] | null;
  image_urls: string[] | null;
  external_url: string | null;
  kind?: string | null;
  tool_kind?: string | null;
  key_features?: string[] | null;
  materials?: string[] | null;
};

const OfferPage = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const slot = (params.get("slot") as PlacementSlot | null) ?? null;
  const nav = useNavigate();
  const { user } = useAuth();
  const logStat = useLogBrandStat();
  const { allProducts, upsert } = useUserProducts();
  const { tools: userTools, reload: reloadTools } = useUserTools();
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toolAdvice, setToolAdvice] = useState<Record<string, unknown> | null>(null);
  const [toolAdviceOpen, setToolAdviceOpen] = useState(false);
  const [toolAdviceTitle, setToolAdviceTitle] = useState("");

  const { data: offer, isLoading } = useQuery({
    queryKey: ["brand-offer-public", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("id, headline, body_copy, hero_image_path, external_url, discount_code, status, ends_on, brand_user_id, brand_products(*), brand_profiles!inner(brand_name)")
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

  // Record an impression the first time this offer page renders for the user
  // this session (dedupe handled inside the hook). Also counts as a tap since
  // reaching this page means the banner was engaged.
  useEffect(() => {
    if (!offer?.id) return;
    logStat.mutate({ offer_id: offer.id, slot, kind: "impressions" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  if (isLoading || !offer) return <LoadingDot />;

  const goOffer = (url: string) => {
    logStat.mutate({ offer_id: offer.id, slot, kind: "taps" });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const brandName =
    (offer as { brand_profiles?: { brand_name?: string } }).brand_profiles?.brand_name ?? null;

  const isTool = (bp: BrandItemRow) => bp.kind === "tool";

  const findExistingProduct = (bp: BrandItemRow) =>
    allProducts.find(
      (row) =>
        row.product_key === productKeyFor(bp.id) ||
        row.linked_brand_product_id === bp.id ||
        (row.name.trim().toLowerCase() === bp.name.trim().toLowerCase() &&
          (row.brand ?? "").trim().toLowerCase() === (brandName ?? "").trim().toLowerCase()),
    );

  const findExistingTool = (bp: BrandItemRow) =>
    userTools.find((t) => {
      const linked = (t as unknown as { linked_brand_product_id?: string | null }).linked_brand_product_id;
      return (
        t.tool_key === toolKeyFor(bp.id) ||
        linked === bp.id ||
        (t.name.trim().toLowerCase() === bp.name.trim().toLowerCase() &&
          (t.brand ?? "").trim().toLowerCase() === (brandName ?? "").trim().toLowerCase())
      );
    });

  const upsertBrandProduct = async (
    bp: BrandItemRow,
    opts: { wishlist: boolean },
  ): Promise<UserProduct | null> => {
    const existing = findExistingProduct(bp);
    const payload: Partial<UserProduct> & { product_key: string; name: string } = {
      product_key: existing?.product_key ?? productKeyFor(bp.id),
      name: bp.name,
      brand: brandName,
      ingredients: bp.ingredients ?? existing?.ingredients ?? [],
      image_url: bp.image_urls?.[0] ?? existing?.image_url ?? null,
      linked_brand_offer_id: offer.id,
      linked_brand_product_id: bp.id,
    };
    if (opts.wishlist) payload.on_wishlist = true;
    return upsert(payload);
  };

  const upsertBrandTool = async (bp: BrandItemRow, opts: { wishlist: boolean }) => {
    if (!user) return null;
    const existing = findExistingTool(bp);
    if (existing) {
      const patch: Record<string, unknown> = {
        linked_brand_offer_id: offer.id,
        linked_brand_product_id: bp.id,
      };
      if (opts.wishlist) patch.on_shelf = false; // wishlist = not yet on shelf
      const { error } = await supabase
        .from("user_tools")
        .update(patch as never)
        .eq("id", existing.id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Could not update tool");
        return null;
      }
      await reloadTools();
      return existing;
    }
    const insertRow = {
      user_id: user.id,
      tool_key: toolKeyFor(bp.id),
      name: bp.name,
      brand: brandName,
      category: null,
      image_url: bp.image_urls?.[0] ?? null,
      notes: bp.description ?? null,
      source_url: bp.external_url ?? null,
      on_shelf: !opts.wishlist,
      linked_brand_offer_id: offer.id,
      linked_brand_product_id: bp.id,
    };
    const { data, error } = await supabase
      .from("user_tools")
      .insert(insertRow as never)
      .select("*")
      .single();
    if (error) {
      console.error("brand tool insert failed", error);
      toast.error("Could not add tool");
      return null;
    }
    await reloadTools();
    return data as unknown as (typeof userTools)[number];
  };

  const addToWishlist = async (bp: BrandItemRow) => {
    if (!user) return;
    setBusyId(bp.id);
    try {
      const row = isTool(bp)
        ? await upsertBrandTool(bp, { wishlist: true })
        : await upsertBrandProduct(bp, { wishlist: true });
      if (row) {
        logStat.mutate({ offer_id: offer.id, slot, kind: "wishlist_adds" });
        toast.success("Added to your wishlist");
      }
    } finally {
      setBusyId(null);
    }
  };

  /** Native AI analysis:
   *  - Products: upsert + jump into the standard product profile page
   *    which already renders personalised ingredient suitability.
   *  - Tools: reuse the existing tool-analyse-url + ToolAdviceDialog UX
   *    users know from the Tools section — no ingredients, judged on
   *    tool type/materials vs their hair profile. */
  const analyseForMe = async (bp: BrandItemRow) => {
    if (!user) return;
    setBusyId(bp.id);
    try {
      if (isTool(bp)) {
        if (!bp.external_url) {
          toast.error("This tool has no link to analyse");
          return;
        }
        const context = await buildAiContext();
        const { data, error } = await supabase.functions.invoke("tool-analyse-url", {
          body: { url: bp.external_url, context },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));
        setToolAdvice(data as Record<string, unknown>);
        setToolAdviceTitle(bp.name);
        setToolAdviceOpen(true);
      } else {
        const row = await upsertBrandProduct(bp, { wishlist: false });
        if (row) nav(`/products/profile/${row.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
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
              <div className="mt-3">
                <DiscountCodeChip code={offer.discount_code} variant="block" />
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
            <SectionLabel className="!px-0">In this offer</SectionLabel>
            {(offer.brand_products ?? []).map((raw) => {
              const p = raw as unknown as BrandItemRow;
              const tool = isTool(p);
              const alreadyWishlisted = tool
                ? !!findExistingTool(p)
                : !!findExistingProduct(p)?.on_wishlist;
              return (
                <SurfaceCard key={p.id} className="space-y-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-display text-[15px] leading-tight">{p.name}</p>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-border rounded-pill px-1.5 py-[1px]">
                        {tool ? "Tool" : "Product"}
                      </span>
                    </div>
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
                    {tool
                      ? '"For me?" checks this tool against your hair profile the same way your Tools section does.'
                      : '"For me?" opens the full personalised ingredient analysis you already use for your shelf.'}
                  </p>
                </SurfaceCard>
              );
            })}
          </>
        )}
      </div>

      <ToolAdviceDialog
        open={toolAdviceOpen}
        onOpenChange={setToolAdviceOpen}
        payload={toolAdvice}
        title={toolAdviceTitle}
        primaryLabel="Close"
      />
    </ScreenLayout>
  );
};

export default OfferPage;
