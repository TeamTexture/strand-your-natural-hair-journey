import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { prepareImageForAi } from "@/lib/imagePrep";

/** Uploads a scanned/uploaded photo to product-photos storage and routes to
 * the AI scanning screen. The "intent" determines where the user lands after
 * analysis ("shelf" or "wishlist"). All images are re-encoded to JPEG client
 * side so iPhone HEIC photos work with the AI vision model. */
export function useProductScan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const startScan = async (file: File, intent: "shelf" | "wishlist" = "shelf") => {
    if (!user) { toast.error("Please sign in"); return; }
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      toast.error("Pick an image file");
      return;
    }
    if (file.size > 15 * 1024 * 1024) { toast.error("Photo too large (max 15MB)"); return; }
    setBusy(true);
    try {
      // Normalise to JPEG + base64 data URL up-front. This is the critical
      // fix for iPhone HEIC photos: Gemini rejects HEIC but happily reads the
      // re-encoded JPEG data URL we generate here.
      const prepared = await prepareImageForAi(file);
      const path = `${user.id}/scans/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("product-photos")
        .upload(path, prepared.uploadFile, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;
      // We still create a signed URL for the on-screen preview (cheaper than
      // shipping the full data URL through navigation state), but the AI call
      // will use the data URL.
      const { data: signed } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(path, 3600);
      navigate("/products/scanning", {
        state: {
          storage_path: path,
          preview_url: signed?.signedUrl ?? prepared.dataUrl,
          image_data_url: prepared.dataUrl,
          intent,
        },
      });
    } catch (e) {
      console.error("Scan upload failed", e);
      const msg = e instanceof Error ? e.message : "Could not upload photo";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return { startScan, busy };
}
