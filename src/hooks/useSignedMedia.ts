import { useQuery } from "@tanstack/react-query";
import { signedMediaUrls } from "@/lib/treatmentMedia";

/**
 * Signed URLs for private treatment media. Every read of a photo, voice note or
 * video goes through here — the bucket is private and no public URL exists.
 */
export function useSignedMedia(paths: string[]) {
  const key = [...paths].sort().join("|");
  const q = useQuery({
    queryKey: ["treatment-media-urls", key],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: () => signedMediaUrls(paths),
  });
  return { urls: q.data ?? {}, loading: q.isLoading };
}
