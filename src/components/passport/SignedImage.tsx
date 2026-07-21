import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  bucket: string;
  path: string | null | undefined;
  alt?: string;
  className?: string;
  onClick?: (url: string | null) => void;
}

const cache = new Map<string, { url: string; exp: number }>();

const SignedImage = ({ bucket, path, alt = "", className, onClick }: Props) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    const key = `${bucket}:${path}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.exp > now) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    supabase.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => {
      if (cancelled || !data?.signedUrl) return;
      cache.set(key, { url: data.signedUrl, exp: now + 3500 * 1000 });
      setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [bucket, path]);

  if (!path) return null;
  return (
    <div
      className={cn("relative bg-muted rounded-md overflow-hidden", onClick && "cursor-zoom-in", className)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(url); } : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick(url);
        }
      } : undefined}
      aria-label={onClick ? (alt ? `Open ${alt}` : "Open image") : undefined}
    >
      {url && <img src={url} alt={alt} className="w-full h-full object-cover" loading="lazy" />}
    </div>
  );
};

export default SignedImage;

export const useSignedAudio = (bucket: string, path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    supabase.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [bucket, path]);
  return url;
};
