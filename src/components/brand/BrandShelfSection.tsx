// Consumer view of a brand's permanent shelf, shown on the brand page.
// Members can add anything here straight to their own shelf or wishlist —
// the row that's created is an ordinary product row, so it behaves exactly
// like a scanned one everywhere else in the app.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, ExternalLink, Plus } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import ProductThumb from "@/components/ProductThumb";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePublicBrandShelf } from "@/hooks/useBrandShelf";
import { addBrandProductToShelf, type BrandShelfProduct } from "@/lib/addBrandProductToShelf";
import { toast } from "sonner";

const useMyBrandLinks = (ids: string[]) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-brand-product-links", user?.id, ids.join(",")],
    enabled: !!user && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_products")
        .select("product_key, linked_brand_product_id, on_shelf, on_wishlist")
        .eq("user_id", user!.id)
        .in("linked_brand_product_id", ids);
      if (error) throw error;
      const map: Record<string, { product_key: string; on_shelf: boolean; on_wishlist: boolean }> = {};
      for (const row of (data ?? []) as { product_key: string; linked_brand_product_id: string | null; on_shelf: boolean | null; on_wishlist: boolean | null }[]) {
        if (row.linked_brand_product_id) {
          map[row.linked_brand_product_id] = {
            product_key: row.product_key,
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

  if (products.length === 0) return null;

  const add = async (product: BrandShelfProduct, destination: "shelf" | "wishlist") => {
    if (!user) { toast.error("Please sign in"); return; }
    setPending(product.id);
    const key = await addBrandProductToShelf({ userId: user.id, brandName, product, destination });
    setPending(null);
    if (!key) { toast.error("Could not add that product"); return; }
    await qc.invalidateQueries({ queryKey: ["my-brand-product-links"] });
    toast.success(destination === "shelf" ? "Added to your shelf" : "Saved to your wishlist");
    nav(
      `/products/ingredient?key=${encodeURIComponent(key)}&name=${encodeURIComponent(product.name)}&brand=${encodeURIComponent(brandName ?? "")}`,
    );
  };

  return (
    <div>
      <SectionLabel className="!px-0">On {brandName ?? "this brand"}'s shelf</SectionLabel>
      <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-2 leading-snug">
        Added straight from the brand, with their own ingredient list.
      </p>
      <div className="space-y-2">
        {products.map((p) => {
          const mine = links[p.id];
          return (
            <SurfaceCard key={p.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <ProductThumb
                  imageUrl={p.image_urls?.[0] ?? null}
                  alt={p.name}
                  brand={brandName}
                  name={p.name}
                  cover
                  wrapperClassName="size-14 rounded-[10px] overflow-hidden bg-muted shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] leading-tight break-words">{p.name}</p>
                  {p.description && (
                    <p className="mt-1 text-[12.5px] font-body text-foreground/80 leading-snug line-clamp-3 break-words">
                      {p.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {mine?.on_shelf ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-body text-primary">
                    <Check className="size-3.5" /> On your shelf
                  </span>
                ) : (
                  <Button
                    size="sm"
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
                      variant="outline"
                      className="rounded-pill"
                      disabled={pending === p.id}
                      onClick={() => add(p, "wishlist")}
                    >
                      <Heart className="size-3.5 mr-1" /> Wishlist
                    </Button>
                  )
                )}
                {p.external_url && (
                  <a
                    href={p.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-[12px] font-body text-primary"
                  >
                    Buy <ExternalLink className="size-3 opacity-60" />
                  </a>
                )}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </div>
  );
};

export default BrandShelfSection;
