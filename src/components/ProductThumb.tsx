import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Small product thumbnail used across every product list (shelf, wishlist,
 * favourites, off-shelf, repository) and on the product detail header.
 *
 * Prefers `image_url` (set by the product-URL scrape path); falls back to
 * signing the private `storage_path` from the `product-photos` bucket so
 * camera-scanned products show their actual photo as a small avatar
 * everywhere they're listed. URLs are cached in-memory so navigating
 * between list and detail doesn't re-sign on every render.
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

interface ProductThumbProps {
  imageUrl?: string | null;
  storagePath?: string | null;
  alt?: string;
  className?: string;
  /** Tailwind classes for the wrapper. Defaults to a 48px rounded tile. */
  wrapperClassName?: string;
  /** Use object-cover instead of object-contain (cover crops nicely for camera photos). */
  cover?: boolean;
  /** Emoji shown when no image is available. */
  fallbackEmoji?: string;
}

export default function ProductThumb({
  imageUrl,
  storagePath,
  alt = "",
  className,
  wrapperClassName,
  cover = false,
  fallbackEmoji = "🧴",
}: ProductThumbProps) {
  const [resolved, setResolved] = useState<string | null>(imageUrl ?? null);

  useEffect(() => {
    if (imageUrl) {
      setResolved(imageUrl);
      return;
    }
    if (!storagePath) {
      setResolved(null);
      return;
    }
    const now = Date.now();
    const cached = signedUrlCache.get(storagePath);
    if (cached && cached.expiresAt > now + 60_000) {
      setResolved(cached.url);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(storagePath, 3600);
      if (cancelled) return;
      if (data?.signedUrl) {
        signedUrlCache.set(storagePath, {
          url: data.signedUrl,
          expiresAt: now + 3600 * 1000,
        });
        setResolved(data.signedUrl);
      } else {
        setResolved(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, storagePath]);

  const wrapper = wrapperClassName ?? "size-12 rounded-[10px] overflow-hidden bg-transparent shrink-0";

  return (
    <div className={wrapper}>
      {resolved ? (
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          className={cn(
            "size-full",
            cover ? "object-cover" : "object-contain mix-blend-multiply",
            className,
          )}
        />
      ) : (
        <div className="size-full flex items-center justify-center text-2xl bg-primary/15">
          {fallbackEmoji}
        </div>
      )}
    </div>
  );
}
