// Opening a product from a brand's public shelf.
//
// This page renders nothing of its own — it decides WHICH product page the
// member sees and forwards to it:
//
//   • already on their shelf/wishlist (a `user_products` row whose
//     `linked_brand_product_id` is this catalogue item) → their OWN product
//     page, so their rating, notes and history are intact.
//   • otherwise → the SAME consumer product page (src/pages/IngredientDetail.tsx)
//     in its unsaved "fresh analysis" mode: full description, ingredient list,
//     features and images, with add-to-shelf / wishlist / buy actions.
//
// There is deliberately no separate brand-side product detail screen.

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePublicBrandShelf } from "@/hooks/useBrandShelf";
import { brandProductKey } from "@/lib/addBrandProductToShelf";

const BrandShelfProductOpen = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { brandUserId, brandProductId } = useParams<{ brandUserId: string; brandProductId: string }>();
  const { data: products, isLoading } = usePublicBrandShelf(brandUserId);

  useEffect(() => {
    if (isLoading || !brandProductId || !brandUserId) return;
    let cancelled = false;

    (async () => {
      const product = (products ?? []).find((p) => p.id === brandProductId);
      if (!product) {
        if (!cancelled) nav(`/brands/${brandUserId}`, { replace: true });
        return;
      }

      // Does the member already own this item? If so, their own page wins.
      if (user) {
        const { data: mine } = await supabase
          .from("user_products")
          .select("product_key, name, brand")
          .eq("user_id", user.id)
          .eq("linked_brand_product_id", brandProductId)
          .maybeSingle();
        if (cancelled) return;
        if (mine) {
          nav(
            `/products/ingredient?key=${encodeURIComponent(mine.product_key)}&name=${encodeURIComponent(mine.name)}&brand=${encodeURIComponent(mine.brand ?? "")}`,
            { replace: true },
          );
          return;
        }
      }

      const { data: brandRow } = await supabase
        .from("brand_profiles")
        .select("brand_name")
        .eq("user_id", brandUserId)
        .maybeSingle();
      if (cancelled) return;
      const brandName = brandRow?.brand_name ?? "";

      nav(
        `/products/ingredient?key=${encodeURIComponent(brandProductKey(product.id))}&name=${encodeURIComponent(product.name)}&brand=${encodeURIComponent(brandName)}`,
        {
          replace: true,
          state: {
            // The consumer page's existing unsaved-product mode. Shape matches
            // the product-analyse payload it already knows how to render.
            analysis: {
              product_name: product.name,
              brand: brandName,
              ingredients: product.ingredients ?? [],
              ai_summary: product.description ?? "",
              use_cases: product.key_features ?? [],
            },
            preview_url: product.image_urls?.[0] ?? null,
            brand_product_id: product.id,
            external_url: product.external_url ?? null,
            intent: "shelf",
            // The brand shelf only supplies catalogue facts. The page must still
            // run the member's own ingredient analysis so the score, verdict and
            // guidance are personalised — never the brand's marketing copy.
            needs_analysis: true,
          },
        },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [brandProductId, brandUserId, isLoading, products, user, nav]);

  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <LoadingDot label="Loading product…" />
    </div>
  );
};

export default BrandShelfProductOpen;
