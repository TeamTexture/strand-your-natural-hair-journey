import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/** Uploads a scanned/uploaded photo to product-photos storage and routes to
 * the AI scanning screen. The "intent" determines where the user lands after
 * analysis ("shelf" or "wishlist"). */
export function useProductScan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const startScan = async (file: File, intent: "shelf" | "wishlist" = "shelf") => {
    if (!user) { toast.error("Please sign in"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Pick an image file"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Photo too large (max 8MB)"); return; }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/scans/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(path, 3600);
      navigate("/products/scanning", {
        state: { storage_path: path, preview_url: signed?.signedUrl ?? "", intent },
      });
    } catch (e) {
      console.error("Scan upload failed", e);
      toast.error("Could not upload photo");
    } finally {
      setBusy(false);
    }
  };

  return { startScan, busy };
}
