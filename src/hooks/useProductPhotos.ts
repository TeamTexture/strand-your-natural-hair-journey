import { uuid } from "@/lib/uuid";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const BUCKET = "product-photos";

export interface ProductPhoto {
  product_key: string;
  storage_path: string;
  signedUrl: string | null;
}

/** Loads all product photos for the current user keyed by product_key. */
export function useProductPhotos(productKeys: string[]) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Record<string, ProductPhoto>>({});
  const [loading, setLoading] = useState(true);

  // Stable key signature so the effect doesn't loop when callers pass new arrays
  const keysSig = productKeys.slice().sort().join("|");

  const load = useCallback(async () => {
    if (!user || productKeys.length === 0) {
      setPhotos({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_product_photos")
      .select("product_key, storage_path")
      .eq("user_id", user.id)
      .in("product_key", productKeys);
    if (error) {
      console.error("Product photo load failed:", error);
      setPhotos({});
      setLoading(false);
      return;
    }
    const out: Record<string, ProductPhoto> = {};
    await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: sig } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(row.storage_path, 3600);
        out[row.product_key] = {
          product_key: row.product_key,
          storage_path: row.storage_path,
          signedUrl: sig?.signedUrl ?? null,
        };
      }),
    );
    setPhotos(out);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, keysSig]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** Upload (or replace) a photo for a product. Returns true on success. */
  const uploadPhoto = async (
    productKey: string,
    file: File,
    meta?: { name?: string; brand?: string },
  ): Promise<boolean> => {
    if (!user) {
      toast.error("Please sign in to add photos");
      return false;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return false;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photo too large (max 8MB)");
      return false;
    }
    try {
      const existing = photos[productKey];
      if (existing) {
        await supabase.storage.from(BUCKET).remove([existing.storage_path]);
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${productKey}/${uuid()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("user_product_photos")
        .upsert(
          {
            user_id: user.id,
            product_key: productKey,
            product_name: meta?.name,
            product_brand: meta?.brand,
            storage_path: path,
          },
          { onConflict: "user_id,product_key" },
        );
      if (dbErr) throw dbErr;

      const { data: sig } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);
      setPhotos((prev) => ({
        ...prev,
        [productKey]: { product_key: productKey, storage_path: path, signedUrl: sig?.signedUrl ?? null },
      }));
      toast.success("Photo saved");
      return true;
    } catch (e) {
      console.error("Product photo upload failed:", e);
      toast.error("Could not upload photo");
      return false;
    }
  };

  const removePhoto = async (productKey: string) => {
    if (!user) return;
    const existing = photos[productKey];
    if (!existing) return;
    try {
      await supabase.storage.from(BUCKET).remove([existing.storage_path]);
      await supabase
        .from("user_product_photos")
        .delete()
        .eq("user_id", user.id)
        .eq("product_key", productKey);
      setPhotos((prev) => {
        const next = { ...prev };
        delete next[productKey];
        return next;
      });
      toast.success("Photo removed");
    } catch (e) {
      console.error("Remove failed:", e);
      toast.error("Could not remove photo");
    }
  };

  return { photos, loading, uploadPhoto, removePhoto, reload: load };
}
