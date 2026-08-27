import { useEffect, useState } from "react";
import ShelfProductCard from "@/components/product/ShelfProductCard";
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
import BrandShelfSection from "@/components/brand/BrandShelfSection";
import BrandOfferBanner, { BannerOffer } from "@/components/brand/BrandOfferBanner";

interface PastOffer {
  id: string;
  headline: string | null;
  body_copy: string | null;
  hero_image_path: string | null;
  external_url: string | null;
  starts_on: string | null;
  ends_on: string | null;
  brand_products?: { name: string | null }[] | null;
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
  const products = (offer.brand_products ?? []).map((p) => p.name).filter(Boolean) as string[];

  return (
    <SurfaceCard className="p-0 overflow-hidden min-w-0 opacity-95">
      <div className="relative h-[76px] w-full bg-muted">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover grayscale-[45%] opacity-80" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] font-body font-medium px-2 py-0.5 rounded-full bg-foreground/85 text-background">
          Ended
        </span>
        <div className="absolute inset-x-0 bottom-0 p-2.5 min-w-0">
          <p className="font-display text-white text-[13px] leading-tight line-clamp-2 drop-shadow-sm [overflow-wrap:anywhere]">
            {offer.headline || "Offer"}
          </p>
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-1.5 min-w-0">
        <p className="text-[10px] font-body text-muted-foreground">
          Ran {offer.starts_on ? format(new Date(offer.starts_on), "d MMM") : ""}
          {offer.ends_on ? ` – ${format(new Date(offer.ends_on), "d MMM yyyy")}` : ""}
        </p>
        {offer.body_copy && (
          <p className="text-[11px] font-body text-muted-foreground leading-snug line-clamp-2 [overflow-wrap:anywhere]">
            {offer.body_copy}
          </p>
        )}
        {products.length > 0 && (
          <p className="text-[11px] font-body text-muted-foreground/90 leading-snug [overflow-wrap:anywhere]">
            {products.slice(0, 3).join(", ")}
            {products.length > 3 ? ` +${products.length - 3} more` : ""}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5 min-w-0">
          {offer.external_url ? (
            <a
              href={offer.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground hover:underline shrink-0"
            >
              <ExternalLink className="size-3" /> Visit brand
            </a>
          ) : (
            <span />
          )}
          {alreadyInterested ? (
            <button
              type="button"
              onClick={() => register.mutate({ offerId: offer.id, interested: false })}
              disabled={register.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-body text-good"
            >
              <Check className="size-3.5" /> Waiting on this — undo
            </button>
          ) : (
            <Button
              variant="outline"
              size="pill"
              className="text-[11px] h-8"
              onClick={() => register.mutate({ offerId: offer.id, interested: true })}
              disabled={register.isPending}
            >
              <Heart className="size-3.5 mr-1" /> I'd want this again
            </Button>
          )}
        </div>
        <p className="text-[10px] font-body text-muted-foreground/70 leading-snug">
          This discount has ended.
        </p>
      </div>
    </SurfaceCard>
  );
};


interface CatalogueItem {
  kind: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  storage_path: string | null;
  source_url: string | null;
  member_count: number;
  offer_id: string | null;
  brand_product_id: string | null;
  viewer_on_shelf: boolean;
  viewer_on_wishlist: boolean;
  viewer_on_favourite: boolean;
  viewer_previously_on_shelf: boolean;
  viewer_item_id: string | null;
}

const statusChipsFor = (item: CatalogueItem): string[] => {
  const chips: string[] = [];
  if (item.viewer_on_shelf) chips.push("On shelf");
  else if (item.viewer_previously_on_shelf) chips.push("Off shelf");
  if (item.viewer_on_wishlist) chips.push("On wishlist");
  if (item.viewer_on_favourite) chips.push("Favourited");
  return chips;
};

// Same card as the member's own shelf — see ShelfProductCard.
const CatalogueRow = ({ item, onOpen }: { item: CatalogueItem; onOpen: () => void }) => {
  const chips = statusChipsFor(item);
  return (
    <ShelfProductCard
      name={item.name}
      brand={item.kind === "tool" ? "Tool" : item.kind === "supplement" ? "Supplement" : "Product"}
      imageUrl={item.image_url}
      storagePath={item.storage_path}
      onOpen={onOpen}
      meta={
        item.member_count > 1 ? (
          <span className="text-[10.5px] text-muted-foreground font-body">
            {item.member_count} members using it
          </span>
        ) : undefined
      }
      chips={chips.map((c) => (
        <span
          key={c}
          className="inline-flex items-center rounded-pill border border-primary/25 bg-primary/[0.07] px-2 py-0.5 text-[10px] font-body font-medium text-primary"
        >
          {c}
        </span>
      ))}
    />

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
      const [brandRes, liveRes, pastRes, catRes] = await Promise.all([
        supabase
          .from("brand_profiles")
          .select("user_id, brand_name, category, about, website, logo_path, instagram_handle, tiktok_handle, contact_email, created_at")
          .eq("user_id", brandUserId!)
          .maybeSingle(),
        supabase
          .from("brand_offers")
          .select("id, headline, body_copy, hero_image_path, external_url, discount_code, starts_on, ends_on, status, brand_user_id, brand_offer_products(position, created_at, brand_products(id, name, description, kind, tool_kind, ingredients, key_features, materials, image_urls, external_url))")
          .eq("brand_user_id", brandUserId!)
          // Hidden offers are excluded from both public sections entirely.
          .is("hidden_at", null)
          .in("status", ["live", "paid_scheduled"])
          .lte("starts_on", today)
          .gte("ends_on", today)
          .order("starts_on")
          .order("position", { referencedTable: "brand_offer_products", ascending: true })
          .order("created_at", { referencedTable: "brand_offer_products", ascending: true }),
        supabase
          .from("brand_offers")
          .select("id, headline, body_copy, hero_image_path, external_url, starts_on, ends_on, brand_offer_products(position, brand_products(name))")
          .eq("brand_user_id", brandUserId!)
          .is("hidden_at", null)
          .eq("status", "ended")
          .order("ends_on", { ascending: false })
          .limit(10),

        supabase.rpc("brand_public_catalogue", { _brand_user_id: brandUserId! }),
      ]);

      // Flatten the junction into `brand_products` — ONE PRODUCT PER ADVERT, so
      // the first row by `position` is the advertised product.
      const flatten = (rows: unknown[]): Array<Record<string, unknown> & { id: string }> =>
        (rows ?? []).map((r) => {
          const row = r as { brand_offer_products?: Array<{ brand_products: unknown }> | null };
          return {
            ...(r as Record<string, unknown>),
            brand_products: (row.brand_offer_products ?? []).map((j) => j.brand_products).filter(Boolean),
          } as unknown as Record<string, unknown> & { id: string };
        });


      return {
        brand: brandRes.data,
        live: flatten(liveRes.data ?? []),
        past: flatten(pastRes.data ?? []) as unknown as PastOffer[],
        catalogue: ((catRes.data ?? []) as CatalogueItem[]),
      };

    },
  });

  const brand = data?.brand;
  const logoUrl = useSignedUrl(brand?.logo_path ?? null);
  const catalogue = data?.catalogue ?? [];
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);



  const openCatalogueItem = (item: CatalogueItem) => {
    if (item.offer_id && item.brand_product_id) {
      nav(`/offers/${item.offer_id}/product/${item.brand_product_id}`);
    } else if (item.viewer_item_id) {
      nav(item.kind === "tool" ? `/tools/${item.viewer_item_id}` : `/products/profile/${item.viewer_item_id}`);
    } else if (item.brand_product_id) {
      // Not advertised and not owned yet — open the catalogue item so she can
      // add it (tools land in My Tools, products on her shelf).
      nav(`/brands/${brandUserId}/product/${item.brand_product_id}`);
    } else if (item.source_url) {
      window.open(item.source_url, "_blank", "noopener,noreferrer");
    }
  };


  if (isLoading) return <LoadingDot />;

  if (!brand) {
    return (
      <ScreenLayout>
        <TitleBar title="Brand" />
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
      <TitleBar title={brand.brand_name ?? "Brand"} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="p-4">
          <div className="flex items-start gap-3.5">
            <div className="size-[72px] rounded-2xl bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
              {logoUrl ? (
                <img src={logoUrl} alt={`${brand.brand_name} logo`} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-primary text-2xl">
                  {brand.brand_name?.[0] ?? "✦"}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-[22px] leading-[1.15] [overflow-wrap:anywhere]">
                {brand.brand_name}
              </h1>
              {category && (
                <span className="mt-1.5 inline-flex items-center text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-pill bg-primary/10 text-primary font-body font-semibold">
                  {category}
                </span>
              )}
              {memberSince && (
                <p className="mt-1 text-[10.5px] text-muted-foreground font-body">
                  On STRAND since {memberSince}
                </p>
              )}
            </div>
          </div>


          {about && (
            <>
              <p
                className={`mt-3 text-sm font-body text-foreground/85 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                  aboutOpen ? "" : "line-clamp-2"
                }`}
              >
                {about}
              </p>
              <button
                type="button"
                onClick={() => setAboutOpen((v) => !v)}
                className="mt-1 text-[12px] font-body text-primary underline underline-offset-2"
              >
                {aboutOpen ? "Show less" : "Read more"}
              </button>
            </>
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
          {data!.live.length > 0 ? (
            <div className="space-y-2 min-w-0">
              {/* The same advert card that runs in the app placements — tap to
               *  drop down for the copy, the code and the attached product read
               *  against your own hair. Closing an advert in the app never
               *  loses it; it is always here. */}
              {data!.live.map((o) => (
                <BrandOfferBanner
                  key={o.id}
                  offer={o as unknown as BannerOffer}
                  slot="brand_page"
                  brandName={brand.brand_name ?? null}
                />

              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground font-body leading-snug">
              No live offers right now.
            </p>
          )}


          {data!.past.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">
                Previous offers
              </p>
              <p className="text-[11px] text-muted-foreground font-body mt-1 mb-2 leading-snug">
                Missed one? Tap "I'd want this again" and the brand sees the demand.
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {(pastOpen ? data!.past : data!.past.slice(0, 3)).map((o) => (
                  <PastOfferRow key={o.id} offer={o} />
                ))}
              </div>
              {data!.past.length > 3 && (
                <button
                  type="button"
                  onClick={() => setPastOpen((v) => !v)}
                  className="mt-2 text-[11px] font-body text-primary"
                >
                  {pastOpen ? "Show fewer" : `Show all ${data!.past.length}`}
                </button>
              )}
            </div>
          )}
        </div>



        <BrandShelfSection brandUserId={brandUserId!} brandName={brand.brand_name ?? null} />

        {catalogue.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Products & tools</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-2 leading-snug">
              Everything from {brand.brand_name} that STRAND members are using.
            </p>
            <div className="space-y-2">
              {catalogue.map((item, i) => (
                <CatalogueRow
                  key={`${item.kind}-${item.name}-${i}`}
                  item={item}
                  onOpen={() => openCatalogueItem(item)}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </ScreenLayout>
  );
};

export default BrandDetailPage;
