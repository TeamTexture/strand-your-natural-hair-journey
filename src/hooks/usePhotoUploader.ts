// Tiny helper for uploading user photos to a per-user folder in a private bucket.
// Used by before-photos, milestone-photos, and appointment-photos.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { convertHeicToJpeg } from "@/lib/imagePrep";

export type PhotoBucket = "before-photos" | "milestone-photos" | "appointment-photos";

export function usePhotoUploader(bucket: PhotoBucket) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  /** Upload a single File. Returns the storage path on success, null on failure. */
  const upload = async (file: File): Promise<string | null> => {
    if (!user) return null;
    setUploading(true);
    try {
      const prepared = await convertHeicToJpeg(file).catch(() => file);
      const ext = (prepared.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, prepared, {
        contentType: prepared.type || "image/jpeg",
        upsert: false,
      });
      if (error) {
        console.error(`[${bucket}] upload failed`, error);
        return null;
      }
      return path;
    } finally {
      setUploading(false);
    }
  };

  /** Sign a storage path for display. */
  const sign = async (path: string, expiresIn = 3600): Promise<string | null> => {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    return data?.signedUrl ?? null;
  };

  return { upload, sign, uploading };
}
