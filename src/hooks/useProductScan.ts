import { uuid } from "@/lib/uuid";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { prepareImageForAi } from "@/lib/imagePrep";
import { buildAiContext } from "@/lib/aiContext";

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
 * PERFORMANCE (2026-08-21): the analysis only needs the base64 JPEGs, so
 * neither the two storage uploads nor the member's AI-context build sit in
 * front of the model call any more. Both start here and finish in the
 * background while the analysis runs. Identical inputs to the model — the
 * only change is what we wait for.
 */

/** In-flight AI context for the scan about to start (see useProductScan). */
let pendingContext: Promise<Record<string, unknown> | null> | null = null;

/** Consumed once by the scanning screen; falls back to a fresh build. */
export function takePendingAiContext(): Promise<Record<string, unknown> | null> | null {
  const p = pendingContext;
  pendingContext = null;
  return p;
}

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
      // Start the member-context build immediately — it runs while the
      // photos are being re-encoded and, if needed, while the model call
      // is already in flight.
      const contextPromise = (buildAiContext() as Promise<Record<string, unknown>>).catch((e) => {
        console.error("buildAiContext failed", e);
        return null;
      });
      pendingContext = contextPromise;

      const [preparedFront, preparedBack] = await Promise.all([
        prepareImageForAi(front),
        prepareImageForAi(back),
      ]);

      const frontPath = `${user.id}/scans/${uuid()}.jpg`;
      const backPath = `${user.id}/scans/${uuid()}.jpg`;

      // Fire-and-forget upload: the product row stores these paths and the
      // objects land long before the member leaves the analysis.
      void Promise.all([
        supabase.storage.from("product-photos").upload(frontPath, preparedFront.uploadFile, {
          contentType: "image/jpeg", upsert: false,
        }),
        supabase.storage.from("product-photos").upload(backPath, preparedBack.uploadFile, {
          contentType: "image/jpeg", upsert: false,
        }),
      ]).then(([f, b]) => {
        if (f.error || b.error) {
          console.error("Scan photo upload failed", f.error ?? b.error);
          toast.error("Your analysis is running, but we couldn't save the photos.");
        }
      });

      navigate("/products/scanning", {
        state: {
          // Cover image for the detail screen — the front is the natural choice.
          storage_path: frontPath,
          preview_url: preparedFront.dataUrl,
          // Dual-photo payload for the edge function.
          front_storage_path: frontPath,
          back_storage_path: backPath,
          front_preview_url: preparedFront.dataUrl,
          back_preview_url: preparedBack.dataUrl,
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
