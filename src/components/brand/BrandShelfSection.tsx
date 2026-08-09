// Consumer view of a brand's permanent shelf, shown on the brand page.
//
// The cards here are the SAME component the member's own shelf uses
// (ShelfProductCard) so a brand's listing and a member's shelf never drift.
// Tapping a card opens the ordinary consumer product page — routed through
// /brands/:brandUserId/product/:id, which sends members who already own the
// product to their own shelf item instead of a brand copy.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, ExternalLink, Plus, ChevronDown } from "lucide-react";
import SectionLabel from "@/components/SectionLabel";
import ShelfProductCard from "@/components/product/ShelfProductCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePublicBrandShelf } from "@/hooks/useBrandShelf";
import BrandShelfCardDetail from "@/components/brand/BrandShelfCardDetail";
import { useLiveOffersForProducts } from "@/hooks/useBrandProductEngagement";
import { useLogAdEvent } from "@/hooks/useBrandOffers";
import { addBrandProductToShelf, type BrandShelfProduct } from "@/lib/addBrandProductToShelf";
import { anchorProps } from "@/lib/scrollMemory";
import { toast } from "sonner";

// A catalogue item the member already owns can live in EITHER table: products
// in user_products, tools in user_tools. Read both so a tool the member already
// keeps in My Tools shows as "on your shelf" instead of offering to add it
// again (which is how the duplicate heat hat appeared).
const useMyBrandLinks = (ids: string[]) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-brand-product-links", user?.id, ids.join(",")],
    enabled: !!user && ids.length > 0,
    queryFn: async () => {
      const [products, tools] = await Promise.all([
        supabase
          .from("user_products")
          .select("product_key, linked_brand_product_id, on_shelf, on_wishlist")
          .eq("user_id", user!.id)
          .in("linked_brand_product_id", ids),
        supabase
          .from("user_tools")
          .select("id, linked_brand_product_id, on_shelf, on_wishlist")
          .eq("user_id", user!.id)
          .in("linked_brand_product_id", ids),
      ]);
      if (products.error) throw products.error;
      const map: Record<string, { product_key: string; on_shelf: boolean; on_wishlist: boolean }> = {};
      for (const row of (products.data ?? []) as { product_key: string; linked_brand_product_id: string | null; on_shelf: boolean | null; on_wishlist: boolean | null }[]) {
        if (row.linked_brand_product_id) {
          map[row.linked_brand_product_id] = {
            product_key: row.product_key,
            on_shelf: !!row.on_shelf,
            on_wishlist: !!row.on_wishlist,
          };
        }
      }
      for (const row of (tools.data ?? []) as { id: string; linked_brand_product_id: string | null; on_shelf: boolean | null; on_wishlist: boolean | null }[]) {
        if (row.linked_brand_product_id) {
          map[row.linked_brand_product_id] = {
            product_key: row.id,
            on_shelf: !!row.on_shelf,
            on_wishlist: !!row.on_wishlist,
          };
        }
      }
      return map;
    },
  });
};

const BrandShelfSection = ({
  brandUserId,
  brandName,
}: { brandUserId: string; brandName: string | null }) => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: products = [] } = usePublicBrandShelf(brandUserId);
  const { data: links = {} } = useMyBrandLinks(products.map((p) => p.id));
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: offers = {} } = useLiveOffersForProducts(products.map((p) => p.id));
  const log = useLogAdEvent();

  if (products.length === 0) return null;

  const add = async (product: BrandShelfProduct, destination: "shelf" | "wishlist") => {
    if (!user) { toast.error("Please sign in"); return; }
    setPending(product.id);
    const added = await addBrandProductToShelf({ userId: user.id, brandName, product, destination });
    setPending(null);
    if (!added) { toast.error("Could not add that item"); return; }
    await qc.invalidateQueries({ queryKey: ["my-brand-product-links"] });
    toast.success(destination === "shelf" ? "Added to your shelf" : "Saved to your wishlist");
    // Tools have no ingredient label — they belong in My Tools and open their
    // own tool profile, never the ingredient analysis page.
    if (added.kind === "tool") {
      nav(`/tools/${added.toolId}`);
      return;
    }
    nav(
      `/products/ingredient?key=${encodeURIComponent(added.productKey)}&name=${encodeURIComponent(product.name)}&brand=${encodeURIComponent(brandName ?? "")}`,
    );
  };

  return (
    <div data-scroll-section id={`brand-shelf-${brandUserId}`}>
      <SectionLabel className="!px-0">On {brandName ?? "this brand"}'s shelf</SectionLabel>
      <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-2 leading-snug">
        Added straight from the brand, with their own ingredient list.
      </p>
      <div className="space-y-2">
        {products.map((p) => {
          const mine = links[p.id];
          return (
            <ShelfProductCard
              key={p.id}
              anchor={anchorProps(`brand-product-${p.id}`)}
              name={p.name}
              brand={brandName ?? undefined}
              description={p.description}
              imageUrl={p.image_urls?.[0] ?? null}
              onOpen={() => nav(`/brands/${brandUserId}/product/${p.id}`)}
              chips={
                p.kind === "tool" || p.kind === "supplement" ? (
                  <span className="text-[10px] uppercase tracking-[0.14em] font-body text-muted-foreground">
                    {p.kind === "tool" ? "Tool" : "Supplement"}
                  </span>
                ) : undefined
              }
              footer={
                <>
                  {mine?.on_shelf ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-body text-primary">
                      <Check className="size-3.5" /> On your shelf
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="gold"
                      className="rounded-pill"
                      disabled={pending === p.id}
                      onClick={() => add(p, "shelf")}
                    >
                      <Plus className="size-3.5 mr-1" /> Add to my shelf
                    </Button>
                  )}
                  {mine?.on_wishlist ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-body text-primary">
                      <Heart className="size-3.5" /> On your wishlist
                    </span>
                  ) : (
                    !mine?.on_shelf && (
                      <Button
                        size="sm"
                        variant="goldOutline"
                        className="rounded-pill"
                        disabled={pending === p.id}
                        onClick={() => add(p, "wishlist")}
                      >
                        <Heart className="size-3.5 mr-1" /> Save
                      </Button>
                    )
                  )}
                  {p.external_url && (
                    <a
                      href={p.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        log.mutate({
                          brand_product_id: p.id,
                          offer_id: offers[p.id]?.offer_id ?? null,
                          slot: "brand_shelf",
                          event_type: "link_click",
                        })
                      }
                      className="ml-auto inline-flex items-center gap-1 text-[12px] font-body text-primary"
                    >
                      Buy <ExternalLink className="size-3 opacity-60" />
                    </a>
                  )}
                </>
              }
              headerActions={
                <button
                  type="button"
                  aria-label={expanded === p.id ? "Collapse product" : "Expand product"}
                  aria-expanded={expanded === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((cur) => (cur === p.id ? null : p.id));
                  }}
                  className="p-1 -m-1 text-muted-foreground"
                >
                  <ChevronDown
                    className={`size-4 transition-transform ${expanded === p.id ? "rotate-180" : ""}`}
                  />
                </button>
              }
            >
              {expanded === p.id && (
                <BrandShelfCardDetail
                  product={p}
                  brandName={brandName}
                  offer={offers[p.id]}
                  onOpenDetail={() => nav(`/brands/${brandUserId}/product/${p.id}`)}
                />
              )}
            </ShelfProductCard>
          );
        })}
      </div>
    </div>
  );
};

export default BrandShelfSection;
