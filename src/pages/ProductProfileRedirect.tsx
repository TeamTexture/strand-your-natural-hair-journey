// Redirects /products/profile/:id (legacy) and /products/detail-new (post-scan)
// to the unified product page at /products/ingredient. The legacy route
// loaded the product row by uuid; the new unified page is keyed on
// product_key, so we look up the row first then forward.
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";

const ProductProfileRedirect = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // detail-new: data piggybacks via location.state from the scanner.
      // Hot-path: pull product_key/name/brand straight off state.
      const state = location.state as
        | { productKey?: string; name?: string; brand?: string }
        | null;
      if (state?.productKey) {
        navigate(
          `/products/ingredient?key=${encodeURIComponent(state.productKey)}&name=${encodeURIComponent(state.name ?? "")}&brand=${encodeURIComponent(state.brand ?? "")}`,
          { replace: true },
        );
        return;
      }

      // /products/profile/:id — look up the row by uuid.
      if (id) {
        const { data } = await supabase
          .from("user_products")
          .select("product_key, name, brand")
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          navigate(
            `/products/ingredient?key=${encodeURIComponent(data.product_key)}&name=${encodeURIComponent(data.name)}&brand=${encodeURIComponent(data.brand ?? "")}`,
            { replace: true },
          );
          return;
        }
      }
      // Fallback — back to the products list.
      if (!cancelled) navigate("/products", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, location.state, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <LoadingDot label="Loading product…" />
    </div>
  );
};

export default ProductProfileRedirect;
