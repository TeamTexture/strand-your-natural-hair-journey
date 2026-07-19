// useBloodPanelThumbs — batch-signs private thumbnail paths from the
// "blood-panel-thumbs" bucket so the History list can render preview images.
// Signed URLs are cached in-memory for the panel-id key so repeated renders
// don't hammer the storage endpoint.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 55 * 60 * 1000; // sign for ~1h, refresh a little earlier

export function useBloodPanelThumbs(paths: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const now = Date.now();
    const need = Array.from(
      new Set(
        paths.filter(
          (p): p is string =>
            !!p && (!cache.get(p) || cache.get(p)!.expires < now),
        ),
      ),
    );

    // Seed from cache first so the UI paints instantly.
    const seed: Record<string, string> = {};
    for (const p of paths) {
      if (!p) continue;
      const hit = cache.get(p);
      if (hit && hit.expires > now) seed[p] = hit.url;
    }
    if (Object.keys(seed).length) setUrls((u) => ({ ...u, ...seed }));

    if (need.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("blood-panel-thumbs")
        .createSignedUrls(need, 60 * 60);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((r) => {
        if (r.signedUrl && r.path) {
          cache.set(r.path, { url: r.signedUrl, expires: now + TTL_MS });
          next[r.path] = r.signedUrl;
        }
      });
      if (Object.keys(next).length) setUrls((u) => ({ ...u, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join("|")]);

  return urls;
}

export function useBloodPanelThumb(path: string | null | undefined) {
  const map = useBloodPanelThumbs([path ?? null]);
  return path ? map[path] ?? null : null;
}
