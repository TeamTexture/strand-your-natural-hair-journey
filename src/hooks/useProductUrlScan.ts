import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { toast } from "sonner";

/** Adds a product from a pasted product-page URL. The edge function fetches
 * the page, extracts text, and asks the AI to return the same structured
 * analysis the photo flow returns — so we can route straight to the existing
 * detail screen. */
export function useProductUrlScan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const startUrlScan = async (
    rawUrl: string,
    intent: "shelf" | "wishlist" = "shelf",
    extras?: { auto_save?: boolean; returnTo?: string },
  ) => {
    if (!user) { toast.error("Please sign in"); return; }
    const url = rawUrl.trim();
    if (!url) { toast.error("Paste a product link first"); return; }
    let normalised = url;
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try { new URL(normalised); } catch {
      toast.error("That doesn't look like a valid web link.");
      return;
    }
    setBusy(true);
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("product-analyse-url", {
        body: { url: normalised, context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const product_key = `link-${Date.now()}`;
      // The edge function returns a remote `image_url` pulled from the page's
      // og:image / first image. Pass it through as `preview_url` so the detail
      // screen shows it and persists it on the product row.
      const remoteImage = (data?.image_url as string | undefined) ?? null;

      // Persist the row so /products/ingredient (which loads from
      // user_products by product_key) has data to render. Mirrors the
      // photo-scan path in ProductScanning.tsx.
      const name = typeof data?.product_name === "string" && data.product_name.trim()
        ? data.product_name.trim()
        : "Untitled product";
      const brand = typeof data?.brand === "string" ? data.brand.trim() : null;
      const payload = {
        user_id: user.id,
        product_key,
        name,
        brand,
        category: typeof data?.category === "string" ? data.category : null,
        ingredients: Array.isArray(data?.ingredients) ? data.ingredients : [],
        key_ingredients: Array.isArray(data?.key_ingredients) ? data.key_ingredients : [],
        ai_summary: typeof data?.ai_summary === "string" ? data.ai_summary : null,
        match_score: typeof data?.match_score === "number" ? data.match_score : null,
        image_url: remoteImage,
        on_shelf: intent === "shelf",
        on_wishlist: intent === "wishlist",
        ...(intent === "shelf" ? { added_to_shelf_at: new Date().toISOString() } : {}),
      };
      const { error: insErr } = await supabase
        .from("user_products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(payload as any, { onConflict: "user_id,product_key" });
      if (insErr) {
        console.error("user_products upsert after URL scan failed", insErr);
        throw new Error("Couldn't save that product. Please try again.");
      }

      navigate(
        `/products/ingredient?key=${encodeURIComponent(product_key)}&name=${encodeURIComponent(name)}&brand=${encodeURIComponent(brand ?? "")}`,
        {
          replace: true,
          state: {
            analysis: data,
            storage_path: null,
            preview_url: remoteImage,
            product_key,
            intent,
            source_url: normalised,
            auto_save: extras?.auto_save ?? false,
            returnTo: extras?.returnTo,
          },
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't analyse that page";
      console.error("URL scan failed", e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return { startUrlScan, busy };
}
