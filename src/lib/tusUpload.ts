import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export type TusProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
};

export type TusHandle = {
  abort: () => Promise<void>;
};

/**
 * Resumable (TUS) upload to Supabase Storage.
 * Works for large files (multi-GB) and survives connection drops.
 * Ref: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
 */
export async function tusUpload(opts: {
  bucket: string;
  path: string;
  file: File;
  contentType?: string;
  onProgress?: (p: TusProgress) => void;
}): Promise<{ path: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in required to upload");

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: opts.contentType || opts.file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // 6 MB (Supabase requirement for resumable)
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        opts.onProgress?.({
          bytesUploaded,
          bytesTotal,
          percent: bytesTotal ? (bytesUploaded / bytesTotal) * 100 : 0,
        });
      },
      onSuccess: () => resolve({ path: opts.path }),
    });

    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}
