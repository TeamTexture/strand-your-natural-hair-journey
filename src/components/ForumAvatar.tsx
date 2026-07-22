import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const cache = new Map<string, { url: string; exp: number }>();

interface Props {
  path: string | null | undefined;
  fallback: string;
  className?: string;
}

/**
 * Round avatar for forum posts. `path` is a storage path in the `avatars`
 * bucket (as stored in `profiles.avatar_url`). Signs it on demand and caches.
 */
const ForumAvatar = ({ path, fallback, className }: Props) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!path) return;
    // Already a full URL? Use as-is (legacy rows).
    if (/^https?:\/\//i.test(path)) {
      setUrl(path);
      return;
    }
    const key = `avatars:${path}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.exp > now) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    supabase.storage.from("avatars").createSignedUrl(path, 3600).then(({ data }) => {
      if (cancelled || !data?.signedUrl) return;
      cache.set(key, { url: data.signedUrl, exp: now + 3500 * 1000 });
      setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);

  if (url) {
    return <img src={url} alt="" className={cn("rounded-full object-cover shrink-0", className)} />;
  }
  return (
    <div className={cn("rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0", className)}>
      {fallback}
    </div>
  );
};

export default ForumAvatar;
