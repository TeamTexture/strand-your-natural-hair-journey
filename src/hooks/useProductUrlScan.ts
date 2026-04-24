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

  const startUrlScan = async (rawUrl: string, intent: "shelf" | "wishlist" = "shelf") => {
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
      navigate("/products/detail-new", {
        state: {
          analysis: data,
          storage_path: null,
          preview_url: remoteImage,
          product_key,
          intent,
          source_url: normalised,
        },
      });
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
