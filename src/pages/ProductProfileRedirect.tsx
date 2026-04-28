// Redirects the legacy /products/profile/:id route to the unified product
// page at /products/ingredient. The legacy route loaded the product row by
// uuid; the new unified page is keyed on product_key, so we look up the row
// first then forward.
//
// Note: the post-scan flow no longer routes through here — both the photo
// scan (ProductScanning.tsx) and the URL scan (useProductUrlScan) navigate
// straight to /products/ingredient with the analysis in location.state.
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";

const ProductProfileRedirect = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  }, [id, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <LoadingDot label="Loading product…" />
    </div>
  );
};

export default ProductProfileRedirect;
