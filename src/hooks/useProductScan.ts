import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { prepareImageForAi } from "@/lib/imagePrep";

/**
 * Phase 2 Step 3b — guided dual-photo product scan.
 *
 * The Claude path on `product-analyse` (audit §5 Step 3) requires BOTH the
 * front (brand + product name) and the back (ingredient panel) of the same
 * product. This hook uploads both files to the `product-photos` bucket
 * (one per slot, same bucket as the legacy single-photo flow) and routes
 * to /products/scanning, which invokes the function with the dual-photo
 * body shape.
 *
 * The intent ("shelf" or "wishlist") determines where the user lands after
 * analysis. All images are re-encoded to JPEG client-side so iPhone HEIC
 * photos work with vision models.
 */
export function useProductScan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const startScan = async (
    front: File,
    back: File,
    intent: "shelf" | "wishlist" = "shelf",
    extras?: { auto_save?: boolean; returnTo?: string },
  ) => {
    if (!user) { toast.error("Please sign in"); return; }
    for (const [slot, file] of [["front", front], ["back", back]] as const) {
      if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
        toast.error(`The ${slot} photo isn't a recognised image file.`);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`${slot[0].toUpperCase() + slot.slice(1)} photo is too large (max 15MB).`);
        return;
      }
    }

    setBusy(true);
    try {
      // Re-encode + upload BOTH photos. Each gets its own storage path so
      // the user's product detail screen can show either as the cover image.
      const [preparedFront, preparedBack] = await Promise.all([
        prepareImageForAi(front),
        prepareImageForAi(back),
      ]);

      const frontPath = `${user.id}/scans/${crypto.randomUUID()}.jpg`;
      const backPath = `${user.id}/scans/${crypto.randomUUID()}.jpg`;

      const [{ error: upFrontErr }, { error: upBackErr }] = await Promise.all([
        supabase.storage.from("product-photos").upload(frontPath, preparedFront.uploadFile, {
          contentType: "image/jpeg", upsert: false,
        }),
        supabase.storage.from("product-photos").upload(backPath, preparedBack.uploadFile, {
          contentType: "image/jpeg", upsert: false,
        }),
      ]);
      if (upFrontErr) throw upFrontErr;
      if (upBackErr) throw upBackErr;

      // Signed URLs for on-screen preview only — the AI receives the data URL.
      const [{ data: signedFront }, { data: signedBack }] = await Promise.all([
        supabase.storage.from("product-photos").createSignedUrl(frontPath, 3600),
        supabase.storage.from("product-photos").createSignedUrl(backPath, 3600),
      ]);

      navigate("/products/scanning", {
        state: {
          // Cover image for the detail screen — the front is the natural choice.
          storage_path: frontPath,
          preview_url: signedFront?.signedUrl ?? preparedFront.dataUrl,
          // Dual-photo payload for the edge function.
          front_storage_path: frontPath,
          back_storage_path: backPath,
          front_preview_url: signedFront?.signedUrl ?? preparedFront.dataUrl,
          back_preview_url: signedBack?.signedUrl ?? preparedBack.dataUrl,
          front_image_data_url: preparedFront.dataUrl,
          back_image_data_url: preparedBack.dataUrl,
          intent,
          auto_save: extras?.auto_save ?? false,
          returnTo: extras?.returnTo,
        },
      });
    } catch (e) {
      console.error("Scan upload failed", e);
      const msg = e instanceof Error ? e.message : "Could not upload photos";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return { startScan, busy };
}
