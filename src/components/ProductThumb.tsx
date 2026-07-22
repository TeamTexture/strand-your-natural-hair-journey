import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Small product thumbnail used across every product list (shelf, wishlist,
 * favourites, off-shelf, repository) and on the product detail header.
 *
 * Prefers the saved scan/upload `storage_path`; falls back to `image_url`
 * from product URL scans. This keeps camera-scanned front images as the
 * small avatar everywhere the product is listed. Signed URLs are cached
 * in-memory so navigating between list and detail doesn't re-sign on every render.
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Deterministic sand/gold palette for brand-initial placeholders. */
const PLACEHOLDER_PALETTE = [
  "bg-primary/15 text-primary",
  "bg-secondary/70 text-foreground/70",
  "bg-accent/25 text-foreground/70",
  "bg-muted text-foreground/60",
  "bg-primary/10 text-primary",
];
function placeholderClass(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PLACEHOLDER_PALETTE[Math.abs(h) % PLACEHOLDER_PALETTE.length];
}
function initialsFor(brand?: string | null, name?: string | null): string {
  const src = (brand && brand.trim()) || (name && name.trim()) || "";
  if (!src) return "";
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

interface ProductThumbProps {
  imageUrl?: string | null;
  storagePath?: string | null;
  alt?: string;
  className?: string;
  /** Tailwind classes for the wrapper. Defaults to a 48px rounded tile. */
  wrapperClassName?: string;
  /** Use object-cover instead of object-contain (cover crops nicely for camera photos). */
  cover?: boolean;
  /** Emoji shown when no image AND no brand/name is available. */
  fallbackEmoji?: string;
  /** Brand/name used to render an initials placeholder when image is missing. */
  brand?: string | null;
  name?: string | null;
}

export default function ProductThumb({
  imageUrl,
  storagePath,
  alt = "",
  className,
  wrapperClassName,
  cover = false,
  fallbackEmoji = "🧴",
  brand,
  name,
}: ProductThumbProps) {
  const [resolved, setResolved] = useState<string | null>(imageUrl ?? null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    if (!storagePath) {
      setResolved(imageUrl ?? null);
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
      const { data, error } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(storagePath, 3600);
      if (cancelled) return;
      if (error) {
        console.warn("[ProductThumb] sign failed", { storagePath, error: error.message });
        setResolved(imageUrl ?? null);
        return;
      }
      if (data?.signedUrl) {
        signedUrlCache.set(storagePath, {
          url: data.signedUrl,
          expiresAt: now + 3600 * 1000,
        });
        setResolved(data.signedUrl);
      } else {
        setResolved(imageUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, storagePath]);

  const wrapper = wrapperClassName ?? "size-12 rounded-[10px] overflow-hidden bg-transparent shrink-0";
  const initials = initialsFor(brand, name);
  const showImage = resolved && !imgFailed;

  return (
    <div className={wrapper}>
      {showImage ? (
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className={cn(
            "size-full",
            cover ? "object-cover" : "object-contain mix-blend-multiply",
            className,
          )}
        />
      ) : initials ? (
        <div
          className={cn(
            "size-full flex items-center justify-center font-display font-semibold",
            placeholderClass(initials + (brand ?? name ?? "")),
          )}
          aria-label={alt || `${brand ?? name ?? "Product"} placeholder`}
        >
          <span className="text-[13px] leading-none tracking-wide">{initials}</span>
        </div>
      ) : (
        <div className="size-full flex items-center justify-center text-2xl bg-primary/15">
          {fallbackEmoji}
        </div>
      )}
    </div>
  );
}

