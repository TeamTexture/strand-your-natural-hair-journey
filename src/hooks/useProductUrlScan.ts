import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
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
      const tStart = Date.now();
      console.log("[url-debug] client invoke start", { url: normalised });
      const { data, error } = await supabase.functions.invoke("product-analyse-url", {
        body: { url: normalised, context },
      });
      console.log("[url-debug] client invoke done", { ms: Date.now() - tStart });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const product_key = `link-${Date.now()}`;
      // Edge function stamps `_source_image_url` (and mirrors it onto
      // `image_url`) when an og:image was found on the source page.
      const remoteImage =
        (data?._source_image_url as string | undefined) ??
        (data?.image_url as string | undefined) ??
        null;

      // Neutral state — same pattern as photo flow. Only auto-flag
      // shelf/wishlist when the caller explicitly opted in via
      // extras.auto_save (e.g. journal/wash-day picker flows).
      const autoSave = extras?.auto_save === true;
      const saveFields = buildProductSaveFields(data ?? {});
      const payload = {
        user_id: user.id,
        product_key,
        ...saveFields,
        image_url: remoteImage,
        on_shelf: autoSave && intent === "shelf",
        on_wishlist: autoSave && intent === "wishlist",
        ...(autoSave && intent === "shelf"
          ? { added_to_shelf_at: new Date().toISOString() }
          : {}),
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
        `/products/ingredient?key=${encodeURIComponent(product_key)}&name=${encodeURIComponent(saveFields.name)}&brand=${encodeURIComponent(saveFields.brand ?? "")}`,
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
