import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/forumMeta";

const cache = new Map<string, { url: string; exp: number }>();

interface Props {
  path: string | null | undefined;
  /** Display name (or a single letter). Initials are derived from it. */
  fallback: string;
  className?: string;
}

/**
 * Round avatar for community surfaces. `path` is a storage path in the
 * `avatars` bucket (as stored in `profiles.avatar_url`); signed on demand and
 * cached. If there is no photo, the signing fails, or the image itself fails
 * to load, her initials render instead — never a broken image icon.
 */
const ForumAvatar = ({ path, fallback, className }: Props) => {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setUrl(null);
    setBroken(false);
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

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn("rounded-full object-cover shrink-0 bg-[hsl(var(--icon-muted))]", className)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-full bg-[hsl(var(--icon-muted))] text-primary flex items-center justify-center font-body font-semibold shrink-0 leading-none",
        className,
      )}
    >
      {initialsOf(fallback)}
    </div>
  );
};

export default ForumAvatar;
