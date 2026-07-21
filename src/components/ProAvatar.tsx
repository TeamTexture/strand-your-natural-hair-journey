import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  /** Full professional/client name — used to derive initials. */
  name: string;
  /** Optional photo URL or `avatars` bucket storage path. */
  photoUrl?: string | null;
  /** Tailwind size class shorthand (e.g. "size-12", "size-14"). Defaults to size-12. */
  size?: string;
  className?: string;
}

const initialsFor = (name: string): string => {
  const parts = name
    .replace(/^(Dr|Dr\.|Mr|Mrs|Ms|Mx)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const signedCache = new Map<string, { url: string; exp: number }>();

/**
 * Rounded avatar for pros & clients. Accepts either a full http(s) URL or a
 * raw `avatars` bucket storage path (signed on demand, cached in memory).
 * Falls back to initials when no photo is available.
 */
const ProAvatar = ({ name, photoUrl, size = "size-12", className }: Props) => {
  const isHttp = !!photoUrl && /^https?:\/\//.test(photoUrl);
  const [resolved, setResolved] = useState<string | null>(isHttp ? photoUrl! : null);

  useEffect(() => {
    if (!photoUrl || isHttp) {
      setResolved(isHttp ? photoUrl! : null);
      return;
    }
    const now = Date.now();
    const hit = signedCache.get(photoUrl);
    if (hit && hit.exp > now) {
      setResolved(hit.url);
      return;
    }
    let cancelled = false;
    supabase.storage.from("avatars").createSignedUrl(photoUrl, 3600).then(({ data }) => {
      if (cancelled || !data?.signedUrl) return;
      signedCache.set(photoUrl, { url: data.signedUrl, exp: now + 3_500_000 });
      setResolved(data.signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl, isHttp]);

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={name}
        className={cn(size, "rounded-[12px] object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        size,
        "rounded-[12px] bg-primary/15 text-primary flex items-center justify-center shrink-0 font-display font-semibold",
        className,
      )}
      aria-label={name}
    >
      <span className="text-sm tracking-wide">{initialsFor(name)}</span>
    </div>
  );
};

export default ProAvatar;
