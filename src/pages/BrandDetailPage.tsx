import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, Check, Heart, Instagram, Mail, Globe } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyOfferInterest, useRegisterOfferInterest } from "@/hooks/useBrandOfferInterest";

interface PastOffer {
  id: string;
  headline: string | null;
  hero_image_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

const useSignedUrl = (path: string | null | undefined, bucket = "brand-assets") => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from(bucket).createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path, bucket]);
  return url;
};

const PastOfferRow = ({ offer }: { offer: PastOffer }) => {
  const { data: alreadyInterested } = useMyOfferInterest(offer.id);
  const register = useRegisterOfferInterest();
  const heroUrl = useSignedUrl(offer.hero_image_path);

  return (
    <SurfaceCard className="p-0 overflow-hidden">
      <div className="relative h-[96px] w-full bg-muted">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover grayscale-[35%] opacity-90" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] font-body font-medium px-2 py-0.5 rounded-full bg-foreground/85 text-background">
          Expired
        </span>
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="font-display text-white text-[14px] leading-tight line-clamp-2 drop-shadow-sm">
            {offer.headline || "Offer"}
          </p>
        </div>
      </div>
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-body text-muted-foreground">
          Ended {offer.ends_on ? format(new Date(offer.ends_on), "d MMM yyyy") : ""}
        </p>
        {alreadyInterested ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-body text-good">
            <Check className="size-3.5" /> Interest registered
          </span>
        ) : (
          <Button
            variant="outline"
            size="pill"
            className="text-[11px] h-8"
            onClick={() => register.mutate(offer.id)}
            disabled={register.isPending}
          >
            <Heart className="size-3.5 mr-1" /> Show interest
          </Button>
        )}
      </div>
    </SurfaceCard>
  );
};

interface CatalogueItem {
  id: string;
  name: string;
  kind: string;
  image_urls: string[] | null;
  external_url: string | null;
  offer_id: string;
}

const CatalogueTile = ({ item, onOpen }: { item: CatalogueItem; onOpen: () => void }) => {
  const img = item.image_urls?.[0] ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-[12px] border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
    >
      <div className="aspect-square bg-muted">
        {img ? (
          <img src={img} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted/40" />
        )}
      </div>
      <div className="p-2">
        <p className="text-[11.5px] font-body font-medium leading-tight line-clamp-2">{item.name}</p>
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-body mt-0.5">
          {item.kind === "tool" ? "Tool" : "Product"}
        </p>
      </div>
    </button>
  );
};

const BrandDetailPage = () => {
  const nav = useNavigate();
  const { brandUserId } = useParams();
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-detail", brandUserId],
    enabled: !!brandUserId,
    queryFn: async () => {
      const [brandRes, liveRes, pastRes] = await Promise.all([
        supabase
          .from("brand_profiles")
          .select("user_id, brand_name, category, about, website, logo_path, instagram_handle, tiktok_handle, contact_email, created_at")
          .eq("user_id", brandUserId!)
          .maybeSingle(),
        supabase
          .from("brand_offers")
          .select("id, headline, hero_image_path, starts_on, ends_on, status")
          .eq("brand_user_id", brandUserId!)
          .in("status", ["live", "paid_scheduled"])
          .lte("starts_on", today)
          .gte("ends_on", today)
          .order("starts_on"),
        supabase
          .from("brand_offers")
          .select("id, headline, hero_image_path, starts_on, ends_on")
          .eq("brand_user_id", brandUserId!)
          .eq("status", "ended")
          .order("ends_on", { ascending: false })
          .limit(10),
      ]);

      // Products/tools this brand has featured across all of their offers.
      const { data: prods } = await supabase
        .from("brand_products")
        .select("id, name, kind, image_urls, external_url, offer_id, brand_offers!inner(brand_user_id, status)")
        .eq("brand_offers.brand_user_id", brandUserId!);

      return {
        brand: brandRes.data,
        live: liveRes.data ?? [],
        past: (pastRes.data ?? []) as PastOffer[],
        products: (prods ?? []) as unknown as (CatalogueItem & { brand_offers: { status: string } })[],
      };
    },
  });

  const brand = data?.brand;
  const logoUrl = useSignedUrl(brand?.logo_path ?? null);

  // Dedupe products by name, prefer entries linked to a live offer for the tap-through.
  const catalogue = useMemo(() => {
    if (!data?.products) return [] as CatalogueItem[];
    const map = new Map<string, CatalogueItem>();
    for (const p of data.products) {
      const key = p.name?.trim().toLowerCase() ?? p.id;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          id: p.id,
          name: p.name,
          kind: p.kind,
          image_urls: p.image_urls,
          external_url: p.external_url,
          offer_id: p.offer_id,
        });
      }
    }
    return Array.from(map.values()).slice(0, 24);
  }, [data?.products]);

  if (isLoading) return <LoadingDot />;

  if (!brand) {
    return (
      <ScreenLayout>
        <TitleBar title="Brand" onBack={() => nav(-1)} />
        <EmptyState icon="✦" message="Brand not found" />
      </ScreenLayout>
    );
  }

  const memberSince = brand.created_at ? format(new Date(brand.created_at), "MMMM yyyy") : null;
  const instagram = (brand as { instagram_handle?: string | null }).instagram_handle;
  const tiktok = (brand as { tiktok_handle?: string | null }).tiktok_handle;
  const contactEmail = (brand as { contact_email?: string | null }).contact_email;
  const category = (brand as { category?: string | null }).category;
  const about = (brand as { about?: string | null }).about;

  return (
    <ScreenLayout>
      <TitleBar title={brand.brand_name ?? "Brand"} onBack={() => nav(-1)} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start gap-3">
            <div className="size-16 rounded-2xl bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
              {logoUrl ? (
                <img src={logoUrl} alt={`${brand.brand_name} logo`} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-primary text-xl">
                  {brand.brand_name?.[0] ?? "✦"}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-lg leading-tight">{brand.brand_name}</p>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {category && (
                  <span className="text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-body font-semibold">
                    {category}
                  </span>
                )}
                {memberSince && (
                  <span className="text-[10.5px] text-muted-foreground font-body">
                    On STRAND since {memberSince}
                  </span>
                )}
              </div>
            </div>
          </div>

          {about && (
            <p className="mt-3 text-sm font-body text-foreground/85 leading-relaxed whitespace-pre-wrap">
              {about}
            </p>
          )}

          {(brand.website || instagram || tiktok || contactEmail) && (
            <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-x-4 gap-y-2 text-[12px] font-body">
              {brand.website && (
                <a
                  href={brand.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary"
                >
                  <Globe className="size-3.5" /> Website <ExternalLink className="size-3 opacity-60" />
                </a>
              )}
              {instagram && (
                <a
                  href={`https://instagram.com/${instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary"
                >
                  <Instagram className="size-3.5" /> @{instagram}
                </a>
              )}
              {tiktok && (
                <a
                  href={`https://www.tiktok.com/@${tiktok}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary"
                >
                  <span className="text-[10px] font-semibold">TikTok</span> @{tiktok}
                </a>
              )}
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-1 text-primary"
                >
                  <Mail className="size-3.5" /> {contactEmail}
                </a>
              )}
            </div>
          )}
        </SurfaceCard>

        <div>
          <SectionLabel className="!px-0">Live offers</SectionLabel>
          {data!.live.length === 0 ? (
            <EmptyState icon="✦" message="No live offers right now" tone="card" />
          ) : (
            <div className="space-y-2">
              {data!.live.map((o) => (
                <SurfaceCard key={o.id} onClick={() => nav(`/offers/${o.id}`)} className="cursor-pointer hover:border-primary/50">
                  <p className="font-display text-[15px] leading-tight truncate">{o.headline || "Offer"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {o.starts_on ? format(new Date(o.starts_on), "d MMM") : ""}
                    {o.ends_on && o.ends_on !== o.starts_on ? ` – ${format(new Date(o.ends_on), "d MMM")}` : ""}
                  </p>
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>

        {catalogue.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Products & tools</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {catalogue.map((item) => (
                <CatalogueTile
                  key={item.id}
                  item={item}
                  onOpen={() => nav(`/offers/${item.offer_id}/product/${item.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {data!.past.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Previous offers</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-2 leading-snug">
              Missed one? Tap Show interest and we'll let the brand know — they may run it again.
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {data!.past.map((o) => (
                <PastOfferRow key={o.id} offer={o} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandDetailPage;
