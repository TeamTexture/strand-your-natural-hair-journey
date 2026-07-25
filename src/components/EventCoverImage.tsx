import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  path: string | null | undefined;
  className?: string;
  alt?: string;
}

/**
 * Renders an event cover from either an external URL or a storage path
 * inside the private `event-covers` bucket (via a short-lived signed URL).
 */
const EventCoverImage = ({ path, className, alt = "" }: Props) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setSrc(null);
      return;
    }
    if (/^https?:\/\//i.test(path)) {
      setSrc(path);
      return;
    }
    (async () => {
      const { data } = await supabase.storage
        .from("event-covers")
        .createSignedUrl(path, 60 * 60);
      if (!cancelled) setSrc(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!src) return null;
  return <img src={src} alt={alt} className={cn(className)} loading="lazy" />;
};

export default EventCoverImage;
